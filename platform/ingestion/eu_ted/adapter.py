from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

from ingestion.adapters import FetchWindow, SourceEnvelope
from ingestion.events import event_fingerprint

from .client import TEDSearchClient


def _list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(_list(item))
        return result
    if isinstance(value, dict):
        for key in ("value", "eng", "MUL", "text"):
            if key in value:
                return _list(value[key])
        return [str(item) for item in value.values() if item]
    text = str(value).strip()
    return [text] if text else []


def _first(record: dict[str, Any], key: str) -> str | None:
    values = _list(record.get(key))
    return values[0] if values else None


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _decimal(value: str | None) -> Decimal | None:
    try:
        return Decimal(value) if value else None
    except InvalidOperation:
        return None


def _link(record: dict[str, Any], kind: str) -> str | None:
    links = record.get("links") or {}
    values = links.get(kind) or {}
    if isinstance(values, dict):
        return values.get("MUL") or values.get("ENG") or next(iter(values.values()), None)
    return values if isinstance(values, str) else None


def _event_type(notice_type: str | None, notice_subtype: str | None) -> str:
    value = f"{notice_type or ''} {notice_subtype or ''}".casefold()
    if (notice_type or "").startswith("pin-") or "planning" in value:
        return "planning_notice"
    if (notice_type or "").startswith("cn-"):
        return "tender_published"
    if notice_type == "can-modif":
        return "contract_modified"
    if (notice_type or "").startswith("can-") or notice_type == "veat":
        return "award_announced"
    if "change" in value or "corrig" in value:
        return "notice_changed"
    if "modif" in value:
        return "contract_modified"
    if "result" in value or "award" in value:
        return "award_announced"
    if "competition" in value or "contract notice" in value:
        return "tender_published"
    return "other"


class TEDAdapter:
    source_system = "eu_ted"
    source_market = "EU_TED"
    country_code = "EU"

    def __init__(self, client: TEDSearchClient | None = None):
        self.client = client or TEDSearchClient()

    def fetch(self, window: FetchWindow, *, limit: int | None = None) -> Iterable[SourceEnvelope]:
        for notice in self.client.iterate(window.start.date(), window.end.date(), limit=limit):
            publication = _first(notice, "publication-number")
            notice_id = _first(notice, "notice-identifier") or publication
            if not notice_id:
                continue
            source_url = _link(notice, "html") or f"https://ted.europa.eu/en/notice/-/detail/{publication or notice_id}"
            observed = _parse_date(_first(notice, "publication-date")) or datetime.now(timezone.utc)
            yield SourceEnvelope(self.source_system, notice_id, source_url, observed, notice)

    def normalize(self, envelope: SourceEnvelope) -> dict[str, Any]:
        raw = envelope.payload
        publication = _first(raw, "publication-number")
        notice_id = _first(raw, "notice-identifier") or envelope.source_id
        version = _first(raw, "notice-version") or "1"
        procedure_id = _first(raw, "procedure-identifier")
        process_id = procedure_id or f"planning:{publication or notice_id}"
        publication_at = _parse_date(_first(raw, "publication-date")) or envelope.observed_at
        dispatch_at = _parse_date(_first(raw, "dispatch-date"))
        buyer_names = _list(raw.get("buyer-name"))
        buyer_ids = _list(raw.get("organisation-identifier-buyer"))
        buyer_countries = _list(raw.get("buyer-country"))
        tenderer_names = _list(raw.get("organisation-name-tenderer")) or _list(raw.get("tendering-party-name"))
        tenderer_ids = _list(raw.get("organisation-identifier-tenderer"))
        tenderer_countries = _list(raw.get("organisation-country-tenderer"))
        cpv_codes = _list(raw.get("classification-cpv"))
        performance_countries = _list(raw.get("place-of-performance-country-lot")) or _list(raw.get("performance-country"))
        nuts_codes = _list(raw.get("place-of-performance-subdiv-lot")) or _list(raw.get("nuts-codes"))
        lot_ids = _list(raw.get("identifier-lot"))
        contract_ids = _list(raw.get("contract-identifier"))
        notice_type = _first(raw, "notice-type")
        notice_subtype = _first(raw, "notice-subtype")
        value_native = _decimal(_first(raw, "result-value-notice"))
        currency = _first(raw, "result-value-cur-notice")
        suppliers = []
        identifiers_align = len(tenderer_ids) == len(tenderer_names)
        countries_align = len(tenderer_countries) == len(tenderer_names)
        for index, name in enumerate(tenderer_names):
            identifier = tenderer_ids[index] if identifiers_align else None
            country = tenderer_countries[index] if countries_align else None
            suppliers.append({
                "source_supplier_id": identifier or f"{notice_id}:{index}",
                "legal_name": name,
                "address": {"country": country} if country else {},
                "identifiers": [{"scheme": "TED_ORGANISATION", "id": identifier}] if identifier else [],
            })
        source_country = buyer_countries[0] if buyer_countries else None
        event_type = _event_type(notice_type, notice_subtype)
        payload_hash = hashlib.sha256(json.dumps(raw, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()
        xml_url = _link(raw, "xml")
        change_ids = _list(raw.get("change-notice-version-identifier"))
        previous_ids = _list(raw.get("modification-previous-notice-identifier"))
        if notice_type and notice_type.startswith("cn-") and change_ids:
            event_type = "tender_changed"
        elif change_ids and event_type not in {"contract_modified", "tender_changed"}:
            event_type = "notice_changed"
        title = _first(raw, "title-proc")
        description = _first(raw, "description-proc")
        return {
            "source_system": self.source_system,
            "source_market": self.source_market,
            "source_country": source_country,
            "source_process_id": process_id,
            "ocid": None,
            "source_release_id": f"{notice_id}:{version}",
            "source_url": envelope.source_url,
            "source_last_modified": publication_at,
            "release_date": publication_at,
            "tags": [event_type],
            "title": title,
            "description": description,
            "current_stage": "planning" if event_type == "planning_notice" else "tender" if event_type.startswith("tender") else "award" if event_type == "award_announced" else "contract" if event_type.startswith("contract") else "notice",
            "status": None,
            "procurement_method": None,
            "published_at": publication_at,
            "tender_start_at": None,
            "tender_end_at": None,
            "award_date": publication_at.date() if event_type == "award_announced" else None,
            "contract_start_date": None,
            "contract_end_date": None,
            "value_native": value_native,
            "currency": currency,
            "value_usd": None,
            "fx_rate": None,
            "fx_rate_date": None,
            "fx_source_url": None,
            "performance_locations": [
                *({"country": value} for value in performance_countries),
                *({"nuts": value} for value in nuts_codes),
            ],
            "native_category_scheme": "CPV" if cpv_codes else None,
            "native_category_code": cpv_codes[0] if cpv_codes else None,
            "buyer": {
                "source_buyer_id": buyer_ids[0] if buyer_ids else f"notice:{notice_id}:buyer",
                "source_identity_is_synthetic": not bool(buyer_ids),
                "name": buyer_names[0] if buyer_names else None,
                "identifier_scheme": "TED_ORGANISATION" if buyer_ids else None,
                "identifier_value": buyer_ids[0] if buyer_ids else None,
                "address": {"country": source_country} if source_country else {},
            },
            "suppliers": suppliers,
            "events": [{
                "event_fingerprint": event_fingerprint(self.source_system, notice_id, version, "notice-published"),
                "raw_source_id": notice_id,
                "event_type": event_type,
                "event_at": publication_at,
                "title": title,
                "description": description,
                "source_url": envelope.source_url,
                "evidence": {"notice_id": notice_id, "notice_version": version, "notice_type": notice_type, "notice_subtype": notice_subtype},
            }],
            "payload_hash": payload_hash,
            "raw": raw,
            "release_raw": {
                "notice_identifier": notice_id,
                "notice_version": version,
                "publication_number": publication,
                "source_url": envelope.source_url,
                "xml_url": xml_url,
            },
            "notice": {
                "source_notice_id": notice_id,
                "publication_number": publication,
                "notice_version": version,
                "notice_type": notice_type,
                "notice_subtype": notice_subtype,
                "form_type": "eforms",
                "language_codes": list((raw.get("links") or {}).get("html", {}).keys()) if isinstance((raw.get("links") or {}).get("html"), dict) else [],
                "publication_date": publication_at.date(),
                "dispatch_date": dispatch_at.date() if dispatch_at else None,
                "change_notice_id": change_ids[0] if change_ids else None,
                "previous_notice_id": previous_ids[0] if previous_ids else None,
                "xml_url": xml_url,
            },
            "lots": [{
                "source_lot_id": lot_id,
                "cpv_codes": cpv_codes if len(lot_ids) == 1 else [],
                "performance_countries": performance_countries if len(lot_ids) == 1 else [],
                "nuts_codes": nuts_codes if len(lot_ids) == 1 else [],
            } for lot_id in lot_ids],
            "contracts": [{"source_contract_id": contract_id} for contract_id in contract_ids],
        }

    def checkpoint(self, envelope: SourceEnvelope) -> str:
        return f"{envelope.observed_at.isoformat()}|{envelope.source_id}"
