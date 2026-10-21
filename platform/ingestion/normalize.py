from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import quote

from .geography import normalize_geography
from .industry import IndustryClassifier


def nullable_decimal(value):
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        return Decimal(str(value).replace(",", "").replace("$", ""))
    except InvalidOperation:
        return None


def nullable_date(value):
    return str(value)[:10] if value else None


def nullable_datetime(value, fallback: datetime | None = None):
    if not value:
        return fallback
    normalized = str(value).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return fallback


def code_value(value):
    if isinstance(value, dict):
        return value.get("code") or value.get("naics") or value.get("psc")
    return value


def normalize_transaction(raw: dict, fetched_at: datetime, classifier: IndustryClassifier | None = None) -> dict:
    classifier = classifier or IndustryClassifier()
    recipient = normalize_geography(raw.get("Recipient Location") or raw.get("recipient_location"))
    performance = normalize_geography(raw.get("Primary Place of Performance") or raw.get("place_of_performance"))
    # Bulk archives expose a true contract_transaction_unique_key. The search
    # endpoint's misleading `internal_id` is an award surrogate shared by every
    # modification on that award, so it must never be used alone as a transaction key.
    source_transaction_id = str(
        raw.get("source_transaction_id")
        or raw.get("transaction_id")
        or raw.get("contract_transaction_unique_key")
        or ""
    ).strip()
    if not source_transaction_id:
        award_identity = [raw.get("generated_internal_id"), raw.get("internal_id"), raw.get("Award ID")]
        modification = raw.get("Mod") or raw.get("modification_number")
        # Contract modification number is the stable transaction identity within
        # an award and must survive later amount/description corrections.
        identity_fields = [*award_identity, modification] if modification not in (None, "") else [
            *award_identity, raw.get("Action Date"), raw.get("Action Type"), raw.get("Transaction Amount"),
            raw.get("Transaction Description"),
        ]
        identity = "|".join(str(value or "") for value in identity_fields)
        source_transaction_id = "search-derived-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
    generated_award_id = str(raw.get("generated_internal_id") or raw.get("generated_award_id") or "").strip()
    if not generated_award_id:
        identity = "|".join(str(raw.get(key) or "") for key in ("Award ID", "Recipient UEI", "Recipient Name"))
        generated_award_id = "derived-award-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
    description = raw.get("Transaction Description") or raw.get("description")
    industry = classifier.classify(raw)
    modified = nullable_datetime(raw.get("Last Modified Date") or raw.get("last_modified_date"), fetched_at)
    return {
        "company": {
            "uei": (str(raw.get("Recipient UEI") or raw.get("recipient_uei") or "").strip().upper() or None),
            "cage_code": raw.get("CAGE Code") or raw.get("cage_code"),
            "legal_name": raw.get("Recipient Name") or raw.get("recipient_name") or "Unknown recipient",
            "canonical_name": raw.get("Recipient Name") or raw.get("recipient_name") or "Unknown recipient",
            "recipient": recipient.to_dict(),
            "business_size": raw.get("Business Size") or raw.get("business_size"),
        },
        "award": {
            "generated_award_id": generated_award_id,
            "piid": raw.get("Award ID") or raw.get("piid"),
            "parent_award_id": raw.get("Parent Award ID") or raw.get("parent_award_id"),
            "award_type": raw.get("Award Type") or raw.get("award_type"),
            "title": (description[:180] if isinstance(description, str) else None),
            "description": description,
            "awarding_department": raw.get("Awarding Department") or raw.get("Awarding Agency"),
            "awarding_agency": raw.get("Awarding Agency"),
            "awarding_subagency": raw.get("Awarding Sub Agency"),
            "naics": code_value(raw.get("NAICS") or raw.get("naics")),
            "psc": code_value(raw.get("PSC") or raw.get("psc")),
            "industry": industry,
            "total_obligated": nullable_decimal(raw.get("Total Obligated Amount")),
            "current_value": nullable_decimal(raw.get("Current Award Amount")),
            "potential_value": nullable_decimal(raw.get("Potential Award Amount")),
            "award_date": nullable_date(raw.get("Issued Date") or raw.get("award_date") or raw.get("Action Date")),
            "start_date": nullable_date(raw.get("Start Date") or raw.get("start_date")),
            "end_date": nullable_date(raw.get("End Date") or raw.get("end_date")),
            "last_modified": modified,
            "performance": performance.to_dict(),
            "source_url": f"https://www.usaspending.gov/award/{quote(generated_award_id)}/",
        },
        "transaction": {
            "source_transaction_id": source_transaction_id,
            "action_date": nullable_date(raw.get("Action Date") or raw.get("action_date")),
            "action_type": raw.get("Action Type") or raw.get("action_type"),
            "modification_number": raw.get("Mod") or raw.get("modification_number"),
            "obligation": nullable_decimal(raw.get("Transaction Amount") or raw.get("obligation")),
            "current_total_value": nullable_decimal(raw.get("Current Award Amount")),
            "potential_total_value": nullable_decimal(raw.get("Potential Award Amount")),
            "description": description,
            "source_last_modified": modified,
        },
        "raw": raw,
    }
