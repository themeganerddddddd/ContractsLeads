from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable

import requests

from .models import payload_hash, stable_hash


LAYER_URL = "https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/1"
QUERY_URL = f"{LAYER_URL}/query"
DATASET_PAGE = "https://opendata.dc.gov/datasets/a9ac9f8d9d1546e8bd6610b48cb29810"

# Deliberate allowlist: owner, registered-agent, billing, and parcel-owner fields
# from the upstream feed never enter raw_payload or normalized storage.
SAFE_FIELDS = (
    "CUSTOMERNUMBER", "LICENSESTATUS", "LICENSETYPE", "LICENSESTATUSDATE",
    "LICENSESTARTDATE", "LICENSEENDDATE", "INITIALISSUEDATE", "BUSINESSACTIVITY",
    "PREMISEADDRESS", "PREMISEINDC", "ENTITYNAME", "ENTITYTRADENAME", "ENTITYTYPE",
    "PRIMARYACTIVITYFLAG", "CATEGORYSERVICETYPE", "DATAREFRESHEDON", "WARD", "ANC",
    "SMD", "DISTRICT", "PSA", "NEIGHBORHOODCLUSTER", "BUSINESSIMPROVEMENTDISTRICT",
    "MAINSTREET", "MAR_ID", "LATITUDE", "LONGITUDE", "GLOBALID", "OBJECTID",
)

RESIDENTIAL_ACTIVITY_TERMS = (
    "one family rental", "two family rental", "single family rental", "residential rental",
    "apartment rental", "rooming house", "home occupation", "vacation rental",
)


def _text(value: object) -> str | None:
    rendered = str(value or "").strip()
    return rendered or None


def _arcgis_date(value: object) -> date | None:
    if value in (None, ""):
        return None
    try:
        if isinstance(value, (int, float)) or str(value).isdigit():
            return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).date()
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except (ValueError, OSError, OverflowError):
        return None


def _precise_coordinate(value: object, *, latitude: bool) -> Decimal | None:
    if value in (None, ""):
        return None
    rendered = str(value)
    if "." not in rendered or len(rendered.partition(".")[2].rstrip("0")) < 3:
        return None
    try:
        parsed = Decimal(rendered)
    except InvalidOperation:
        return None
    if latitude and not Decimal("38.79") <= parsed <= Decimal("39.00"):
        return None
    if not latitude and not Decimal("-77.13") <= parsed <= Decimal("-76.90"):
        return None
    return parsed


def _premise_parts(value: object) -> dict[str, str | None]:
    parts = [part.strip() for part in str(value or "").split(",") if part.strip()]
    if len(parts) < 5:
        return {"address_line": None, "city": None, "state_code": "DC", "postal_code": None}
    country_index = len(parts) - 1
    postal_index = country_index - 1
    state_index = postal_index - 1
    city_index = state_index - 1
    state = parts[state_index].upper()
    return {
        "address_line": ", ".join(parts[:city_index]) or None,
        "city": parts[city_index] or None,
        "state_code": state if len(state) == 2 else "DC",
        "postal_code": parts[postal_index][:10] or None,
    }


def is_public_operating_premise(attributes: dict[str, Any]) -> bool:
    """Conservatively exclude licenses that can expose a residential premise."""
    if str(attributes.get("PREMISEINDC") or "").casefold() != "yes":
        return False
    activity = str(attributes.get("BUSINESSACTIVITY") or "").casefold()
    category = str(attributes.get("CATEGORYSERVICETYPE") or "").casefold()
    if any(term in activity for term in RESIDENTIAL_ACTIVITY_TERMS):
        return False
    if "housing and lodging" in category and "hotel" not in activity and "inn" not in activity:
        return False
    return bool(_text(attributes.get("PREMISEADDRESS")))


class DcBasicBusinessLicenseAdapter:
    source_system = "dc_basic_business_licenses"

    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()

    def fetch(self, *, limit: int | None = None) -> Iterable[dict[str, Any]]:
        page_size = min(1000, max(1, limit or 1000))
        offset = 0
        yielded = 0
        while True:
            remaining = page_size if limit is None else min(page_size, limit - yielded)
            if remaining <= 0:
                break
            response = self.session.get(
                QUERY_URL,
                params={
                    "where": "1=1",
                    "outFields": ",".join(SAFE_FIELDS),
                    "returnGeometry": "false",
                    "orderByFields": "OBJECTID ASC",
                    "resultRecordCount": remaining,
                    "resultOffset": offset,
                    "f": "json",
                },
                timeout=30,
                headers={"User-Agent": "FederalLedger/1.0 (+https://federal-ledger-west-tech.vercel.app/)"},
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("error"):
                raise ValueError(f"DC license API error: {payload['error'].get('message', 'unknown error')}")
            features = payload.get("features")
            if not isinstance(features, list):
                raise ValueError("DC license API returned a non-list features value")
            for feature in features:
                attributes = feature.get("attributes") if isinstance(feature, dict) else None
                if not isinstance(attributes, dict) or not attributes.get("CUSTOMERNUMBER"):
                    continue
                yield {key: attributes.get(key) for key in SAFE_FIELDS}
                yielded += 1
            if len(features) < remaining or (limit is not None and yielded >= limit):
                break
            offset += len(features)

    def normalize(self, attributes: dict[str, Any], *, observed_at: datetime | None = None) -> dict[str, Any]:
        observed = observed_at or datetime.now(timezone.utc)
        safe = {key: attributes.get(key) for key in SAFE_FIELDS}
        customer_number = str(safe["CUSTOMERNUMBER"]).strip()
        global_id = _text(safe.get("GLOBALID"))
        object_id = _text(safe.get("OBJECTID"))
        source_license_id = global_id or f"{customer_number}:{object_id or 'primary'}"
        content_hash = payload_hash(safe)
        source_url = f"{QUERY_URL}?where=OBJECTID%3D{object_id}&outFields={','.join(SAFE_FIELDS)}&f=json"
        public_premise = is_public_operating_premise(safe)
        parts = _premise_parts(safe.get("PREMISEADDRESS"))
        address_line = parts["address_line"] if public_premise else None
        latitude = _precise_coordinate(safe.get("LATITUDE"), latitude=True) if public_premise else None
        longitude = _precise_coordinate(safe.get("LONGITUDE"), latitude=False) if public_premise else None
        legal_name = _text(safe.get("ENTITYNAME")) or _text(safe.get("ENTITYTRADENAME")) or "Name unavailable"
        display_name = _text(safe.get("ENTITYTRADENAME")) or legal_name
        precision = "exact_address" if address_line else "city" if parts["city"] else "state"
        initial_issue_date = _arcgis_date(safe.get("INITIALISSUEDATE"))
        establishment = None
        signal = None
        if public_premise:
            establishment_fingerprint = stable_hash(
                "establishment", display_name.casefold(), address_line.casefold() if address_line else "",
                parts["city"], parts["state_code"], parts["postal_code"],
            )
            establishment = {
                "establishment_fingerprint": establishment_fingerprint,
                "establishment_name": display_name,
                "establishment_type": _text(safe.get("BUSINESSACTIVITY")),
                "address_line": address_line,
                "city": parts["city"],
                "county": "District of Columbia",
                "county_fips": "11001",
                "state_code": "DC",
                "postal_code": parts["postal_code"],
                "country_code": "US",
                "latitude": latitude,
                "longitude": longitude,
                "location_precision": precision,
                "is_public_business_location": True,
                "location_status": "unknown",
                "verified_headquarters": False,
                "source_system": self.source_system,
                "source_url": source_url,
                "verification_status": "review_required",
                "match_status": "unresolved",
                "confidence": 0.70,
                "evidence": {"license_source_id": source_license_id, "license_is_not_opening_proof": True},
                "first_observed_at": observed,
                "last_observed_at": observed,
            }
            signal = {
                "signal_fingerprint": stable_hash(self.source_system, source_license_id, "new_business_license"),
                "signal_family": "licenses",
                "signal_type": "new_business_license",
                "direction": "positive",
                "observed_at": observed,
                "effective_date": initial_issue_date,
                "country_code": "US",
                "state_code": "DC",
                "county_fips": "11001",
                "city": parts["city"],
                "postal_code": parts["postal_code"],
                "latitude": latitude,
                "longitude": longitude,
                "location_precision": precision,
                "strength": 0.55,
                "reliability": 0.90,
                "confidence": 0.70,
                "source_system": self.source_system,
                "source_url": source_url,
                "source_event_type": "business_license",
                "source_event_id": source_license_id,
                "evidence": {"license_status": _text(safe.get("LICENSESTATUS")), "license_is_not_opening_proof": True},
            }
        return {
            "license_fingerprint": stable_hash(self.source_system, source_license_id),
            "source_record_fingerprint": stable_hash(self.source_system, source_license_id, content_hash),
            "content_hash": content_hash,
            "source_system": self.source_system,
            "source_license_id": source_license_id,
            "legal_name": legal_name,
            "trade_name": _text(safe.get("ENTITYTRADENAME")),
            "entity_type": _text(safe.get("ENTITYTYPE")),
            "license_type": _text(safe.get("LICENSETYPE")),
            "business_activity": _text(safe.get("BUSINESSACTIVITY")),
            "category": _text(safe.get("CATEGORYSERVICETYPE")),
            "license_status": _text(safe.get("LICENSESTATUS")),
            "status_date": _arcgis_date(safe.get("LICENSESTATUSDATE")),
            "initial_issue_date": initial_issue_date,
            "start_date": _arcgis_date(safe.get("LICENSESTARTDATE")),
            "end_date": _arcgis_date(safe.get("LICENSEENDDATE")),
            "premise_address": address_line,
            "city": parts["city"] or "Washington",
            "county": "District of Columbia",
            "county_fips": "11001",
            "state_code": "DC",
            "postal_code": parts["postal_code"],
            "country_code": "US",
            "latitude": latitude,
            "longitude": longitude,
            "location_precision": precision,
            "premise_is_public_business_location": public_premise,
            "source_url": source_url,
            "observed_at": observed,
            "first_observed_at": observed,
            "last_observed_at": observed,
            "resolution_status": "unresolved",
            "resolution_evidence": {"company_match_not_attempted_by_name_only": True},
            "raw_payload": safe,
            "establishment": establishment,
            "signal": signal,
        }

    @staticmethod
    def checkpoint(attributes: dict[str, Any]) -> str:
        refreshed = _arcgis_date(attributes.get("DATAREFRESHEDON"))
        return refreshed.isoformat() if refreshed else str(attributes.get("OBJECTID") or "")
