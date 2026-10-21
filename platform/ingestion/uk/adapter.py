from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable
from urllib.parse import parse_qs, urlparse

import requests

from ingestion.adapters import FetchWindow, SourceEnvelope
from ingestion.events import event_fingerprint


API_URL = "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages"
NOTICE_URL = "https://www.find-tender.service.gov.uk/Notice/{release_id}"


def parse_datetime(value: object) -> datetime | None:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def decimal_or_none(value: object) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _identifiers(party: dict[str, Any]) -> list[dict[str, str]]:
    candidates = [party.get("identifier"), *(party.get("additionalIdentifiers") or [])]
    identifiers = []
    for item in candidates:
        if not isinstance(item, dict) or not item.get("scheme") or not item.get("id"):
            continue
        identifiers.append({"scheme": str(item["scheme"]), "id": str(item["id"])})
    return identifiers


def _parties_with_role(release: dict[str, Any], role: str) -> list[dict[str, Any]]:
    return [party for party in release.get("parties") or [] if role in (party.get("roles") or [])]


def _supplier_parties(release: dict[str, Any]) -> list[dict[str, Any]]:
    by_id = {str(party.get("id")): party for party in release.get("parties") or [] if party.get("id")}
    suppliers: list[dict[str, Any]] = []
    seen: set[str] = set()
    for award in release.get("awards") or []:
        for supplier in award.get("suppliers") or []:
            party = by_id.get(str(supplier.get("id")), supplier)
            key = str(party.get("id") or party.get("name") or "")
            if key and key not in seen:
                seen.add(key)
                suppliers.append(party)
    for party in _parties_with_role(release, "supplier"):
        key = str(party.get("id") or party.get("name") or "")
        if key and key not in seen:
            seen.add(key)
            suppliers.append(party)
    return suppliers


def _first_value(release: dict[str, Any]) -> tuple[Decimal | None, str | None]:
    candidates: list[dict[str, Any]] = []
    candidates.extend(contract.get("value") or {} for contract in release.get("contracts") or [])
    candidates.extend(award.get("value") or {} for award in release.get("awards") or [])
    candidates.append((release.get("tender") or {}).get("value") or {})
    for value in candidates:
        amount = decimal_or_none(value.get("amount"))
        if amount is not None:
            return amount, value.get("currency")
    return None, None


def _cpv(release: dict[str, Any]) -> str | None:
    tender = release.get("tender") or {}
    classifications = [tender.get("classification")]
    for item in tender.get("items") or []:
        classifications.extend(item.get("additionalClassifications") or [])
        classifications.append(item.get("classification"))
    for classification in classifications:
        if isinstance(classification, dict) and str(classification.get("scheme", "")).upper() == "CPV":
            return str(classification.get("id")) if classification.get("id") else None
    return None


def _locations(release: dict[str, Any]) -> list[dict[str, Any]]:
    locations: list[dict[str, Any]] = []
    for item in (release.get("tender") or {}).get("items") or []:
        for address in item.get("deliveryAddresses") or []:
            if isinstance(address, dict) and address not in locations:
                locations.append(address)
    return locations


def _dates(release: dict[str, Any]) -> dict[str, Any]:
    tender = release.get("tender") or {}
    awards = release.get("awards") or []
    contracts = release.get("contracts") or []
    award_date = next((parse_datetime(award.get("date")) for award in awards if award.get("date")), None)
    period = next((contract.get("period") for contract in contracts if contract.get("period")), {}) or {}
    tender_period = tender.get("tenderPeriod") or {}
    return {
        "published_at": parse_datetime(release.get("date")),
        "tender_start_at": parse_datetime(tender_period.get("startDate")),
        "tender_end_at": parse_datetime(tender_period.get("endDate")),
        "award_date": award_date.date() if award_date else None,
        "contract_start_date": (parse_datetime(period.get("startDate")) or None),
        "contract_end_date": (parse_datetime(period.get("endDate")) or None),
    }


def _stage(tags: list[str]) -> str:
    for stage in ("implementation", "contract", "award", "tender", "planning"):
        if stage in tags:
            return stage
    return "unknown"


def _release_events(release: dict[str, Any], source_url: str) -> list[dict[str, Any]]:
    release_id = str(release.get("id") or "")
    event_at = parse_datetime(release.get("date")) or datetime.now(timezone.utc)
    tender = release.get("tender") or {}
    title = tender.get("title")
    description = tender.get("description")
    tags = [str(tag) for tag in release.get("tag") or []]
    mapping = {
        "planning": "planned",
        "tender": "tender_published",
        "tenderUpdate": "tender_updated",
        "award": "award_announced",
        "contract": "contract_signed",
        "implementation": "contract_modified",
        "contractTermination": "contract_completed",
    }
    events: list[dict[str, Any]] = []
    for index, tag in enumerate(tags):
        event_type = mapping.get(tag, "other")
        if tender.get("status") in {"cancelled", "withdrawn"}:
            event_type = "contract_cancelled"
        events.append({
            "event_fingerprint": event_fingerprint("uk_find_a_tender", release_id, tag, index),
            "raw_source_id": release_id,
            "event_type": event_type,
            "event_at": event_at,
            "title": title,
            "description": description,
            "source_url": source_url,
            "evidence": {"release_id": release_id, "tag": tag},
        })
    return events or [{
        "event_fingerprint": event_fingerprint("uk_find_a_tender", release_id, "other"),
        "raw_source_id": release_id,
        "event_type": "other",
        "event_at": event_at,
        "title": title,
        "description": description,
        "source_url": source_url,
        "evidence": {"release_id": release_id, "tag": None},
    }]


class FindATenderAdapter:
    source_system = "uk_find_a_tender"
    country_code = "GB"

    def __init__(self, api_url: str = API_URL, page_size: int = 100):
        self.api_url = api_url
        self.page_size = max(1, min(page_size, 100))
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "FederalLedger/0.1 (official procurement data importer)"})

    def fetch(self, window: FetchWindow, *, limit: int | None = None) -> Iterable[SourceEnvelope]:
        params: dict[str, Any] = {
            "limit": min(self.page_size, limit or self.page_size),
            "updatedFrom": window.start.isoformat(timespec="seconds"),
            "updatedTo": window.end.isoformat(timespec="seconds"),
        }
        if window.cursor:
            params["cursor"] = window.cursor
        emitted = 0
        while True:
            response = self.session.get(self.api_url, params=params, timeout=60)
            response.raise_for_status()
            package = response.json()
            for release in package.get("releases") or []:
                if limit is not None and emitted >= limit:
                    return
                release_id = str(release.get("id") or "")
                if not release_id or not release.get("ocid"):
                    continue
                source_url = NOTICE_URL.format(release_id=release_id)
                observed = parse_datetime(release.get("date")) or datetime.now(timezone.utc)
                yield SourceEnvelope(self.source_system, release_id, source_url, observed, release)
                emitted += 1
            next_url = (package.get("links") or {}).get("next")
            if not next_url:
                return
            cursors = parse_qs(urlparse(next_url).query).get("cursor")
            if not cursors:
                return
            params["cursor"] = cursors[0]

    def normalize(self, envelope: SourceEnvelope) -> dict[str, Any]:
        release = envelope.payload
        tender = release.get("tender") or {}
        tags = [str(tag) for tag in release.get("tag") or []]
        buyer_ref = release.get("buyer") or {}
        parties = release.get("parties") or []
        buyer_party = next((party for party in parties if party.get("id") == buyer_ref.get("id")), buyer_ref)
        buyer_ids = _identifiers(buyer_party)
        buyer_identifier = buyer_ids[0] if buyer_ids else {}
        suppliers = []
        for party in _supplier_parties(release):
            identifiers = _identifiers(party)
            suppliers.append({
                "source_supplier_id": str(party.get("id") or ""),
                "legal_name": party.get("name") or "Unknown supplier",
                "address": party.get("address") or {},
                "identifiers": identifiers,
            })
        value_native, currency = _first_value(release)
        cpv = _cpv(release)
        dates = _dates(release)
        return {
            "source_system": self.source_system,
            "source_country": self.country_code,
            "source_process_id": str(release["ocid"]),
            "ocid": str(release["ocid"]),
            "source_release_id": envelope.source_id,
            "source_url": envelope.source_url,
            "source_last_modified": dates["published_at"],
            "release_date": dates["published_at"],
            "tags": tags,
            "title": tender.get("title"),
            "description": tender.get("description"),
            "current_stage": _stage(tags),
            "status": tender.get("status"),
            "procurement_method": tender.get("procurementMethodDetails") or tender.get("procurementMethod"),
            **dates,
            "contract_start_date": dates["contract_start_date"].date() if dates["contract_start_date"] else None,
            "contract_end_date": dates["contract_end_date"].date() if dates["contract_end_date"] else None,
            "value_native": value_native,
            "currency": currency,
            "value_usd": None,
            "fx_rate": None,
            "fx_rate_date": None,
            "fx_source_url": None,
            "performance_locations": _locations(release),
            "native_category_scheme": "CPV" if cpv else None,
            "native_category_code": cpv,
            "buyer": {
                "source_buyer_id": str(buyer_ref.get("id") or buyer_party.get("id") or buyer_party.get("name") or release["ocid"]),
                "name": buyer_ref.get("name") or buyer_party.get("name") or "Unknown buyer",
                "identifier_scheme": buyer_identifier.get("scheme"),
                "identifier_value": buyer_identifier.get("id"),
                "address": buyer_party.get("address") or {},
            },
            "suppliers": suppliers,
            "events": _release_events(release, envelope.source_url),
            "payload_hash": hashlib.sha256(
                __import__("json").dumps(release, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
            ).hexdigest(),
            "raw": release,
        }

    def checkpoint(self, envelope: SourceEnvelope) -> str:
        return envelope.observed_at.isoformat()
