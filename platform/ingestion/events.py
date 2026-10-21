from __future__ import annotations

import hashlib
from datetime import datetime, time, timezone
from decimal import Decimal
from typing import Any


def event_fingerprint(*parts: object) -> str:
    material = "|".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _event_time(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if hasattr(value, "year"):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)  # type: ignore[arg-type]
    return datetime.now(timezone.utc)


def derive_usaspending_events(normalized: dict[str, Any], *, award_inserted: bool) -> list[dict[str, Any]]:
    """Derive stable lifecycle events from one USAspending transaction.

    The source transaction ID is part of every fingerprint, so overlapping ingestion
    windows are idempotent while distinct modifications remain distinct.
    """
    award = normalized["award"]
    transaction = normalized["transaction"]
    source_id = transaction["source_transaction_id"]
    event_at = _event_time(transaction.get("action_date") or transaction.get("source_last_modified"))
    obligation = transaction.get("obligation")
    description = transaction.get("description") or award.get("description")
    action_text = " ".join(
        str(value or "") for value in (
            transaction.get("action_type"), transaction.get("modification_number"), description
        )
    ).casefold()

    event_types: list[str] = []
    if award_inserted or not transaction.get("modification_number") or transaction.get("modification_number") in {"0", "00", "0000"}:
        event_types.append("award_announced")
    else:
        event_types.append("contract_modified")
    if obligation is not None:
        amount = Decimal(str(obligation))
        if amount > 0 and not award_inserted:
            event_types.append("value_increased")
        elif amount < 0:
            event_types.append("value_decreased")
    if "option" in action_text and any(token in action_text for token in ("exercise", "exercis", "option")):
        event_types.append("option_exercised")

    events = []
    for event_type in dict.fromkeys(event_types):
        events.append({
            "event_fingerprint": event_fingerprint("usaspending", source_id, event_type),
            "source_system": "usaspending",
            "source_country": "US",
            "raw_source_id": source_id,
            "event_type": event_type,
            "event_at": event_at,
            "title": award.get("title") or award.get("piid") or award.get("generated_award_id"),
            "description": description,
            "value_delta_native": obligation if event_type in {"value_increased", "value_decreased"} else None,
            "value_native": transaction.get("current_total_value") or award.get("current_value"),
            "currency": "USD",
            "source_url": award.get("source_url") or "https://www.usaspending.gov/",
            "evidence": {
                "transaction_id": source_id,
                "action_type": transaction.get("action_type"),
                "modification_number": transaction.get("modification_number"),
            },
        })
    return events
