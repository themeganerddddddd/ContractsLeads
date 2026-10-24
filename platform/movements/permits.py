from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable
from urllib.parse import quote

import requests

from .models import payload_hash, stable_hash


DATASET_ID = "i26v-w6bd"
DATASET_PAGE = f"https://data.montgomerycountymd.gov/d/{DATASET_ID}"
RESOURCE_URL = f"https://data.montgomerycountymd.gov/resource/{DATASET_ID}.json"

HIGH_VALUE_TERMS = {
    "data center": "data_center",
    "datacenter": "data_center",
    "manufacturing": "manufacturing",
    "factory": "manufacturing",
    "warehouse": "warehouse",
    "distribution center": "warehouse",
    "laboratory": "laboratory",
    " lab ": "laboratory",
    "industrial": "industrial",
}
EXPANSION_TERMS = re.compile(r"\b(addition|expand|expansion|new building|new construction)\b", re.I)
LOW_SIGNAL_TERMS = re.compile(r"\b(fence|sign|canopy|deck|retaining wall|roof replacement|solar panel)\b", re.I)


def _decimal(value: object) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _date(value: object) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _address(row: dict[str, Any]) -> str | None:
    parts = [row.get(key) for key in ("stno", "predir", "stname", "suffix", "postdir")]
    address = " ".join(str(part).strip() for part in parts if part and str(part).strip())
    return address or None


def _coordinates(row: dict[str, Any]) -> tuple[Decimal | None, Decimal | None]:
    location = row.get("location") or {}
    if not isinstance(location, dict):
        return None, None
    return _decimal(location.get("latitude")), _decimal(location.get("longitude"))


@dataclass(frozen=True)
class PermitRelevance:
    classification: str
    score: float
    reasons: tuple[str, ...]

    @property
    def relevant(self) -> bool:
        return self.classification != "not_relevant"


def classify_commercial_permit(row: dict[str, Any]) -> PermitRelevance:
    description = " ".join(
        str(row.get(key) or "") for key in ("description", "usecode", "worktype", "applicationtype")
    ).casefold()
    value = _decimal(row.get("declaredvaluation")) or Decimal(0)
    area = _decimal(row.get("buildingarea")) or Decimal(0)
    score = 0.0
    reasons: list[str] = []
    classification = "major_renovation"
    for term, label in HIGH_VALUE_TERMS.items():
        if term in f" {description} ":
            classification = label
            score += 0.55
            reasons.append(f"commercial use text: {term.strip()}")
            break
    if EXPANSION_TERMS.search(description):
        classification = "commercial_expansion" if "addition" in description or "expand" in description else "commercial_new_construction"
        score += 0.30
        reasons.append("expansion or new-construction description")
    if str(row.get("worktype") or "").casefold() == "construct":
        score += 0.15
        reasons.append("work type is construct")
    if value >= Decimal("1000000"):
        score += 0.50
        reasons.append("declared value at least $1 million")
        if classification == "major_renovation":
            classification = "high_value_commercial"
    elif value >= Decimal("250000"):
        score += 0.18
        reasons.append("declared value at least $250,000")
    if area >= Decimal("20000"):
        score += 0.25
        reasons.append("building area at least 20,000 square feet")
    elif area >= Decimal("5000"):
        score += 0.12
        reasons.append("building area at least 5,000 square feet")
    if LOW_SIGNAL_TERMS.search(description) and value < Decimal("1000000"):
        score = max(0.0, score - 0.40)
        reasons.append("low-signal improvement type")
    score = min(1.0, round(score, 3))
    if score < 0.50:
        return PermitRelevance("not_relevant", score, tuple(reasons))
    return PermitRelevance(classification, score, tuple(reasons))


class MontgomeryCountyPermitAdapter:
    source_system = "montgomery_county_commercial_permits"

    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()

    def fetch(
        self,
        *,
        since: date | None = None,
        limit: int | None = None,
        overlap_days: int = 14,
    ) -> Iterable[dict[str, Any]]:
        start = (since or (date.today() - timedelta(days=30))) - timedelta(days=max(0, overlap_days))
        page_size = min(1000, max(1, limit or 1000))
        offset = 0
        yielded = 0
        while True:
            remaining = page_size if limit is None else min(page_size, limit - yielded)
            if remaining <= 0:
                break
            response = self.session.get(
                RESOURCE_URL,
                params={
                    "$where": f"addeddate >= '{start.isoformat()}T00:00:00'",
                    "$order": "addeddate ASC, permitno ASC",
                    "$limit": remaining,
                    "$offset": offset,
                },
                timeout=30,
                headers={"User-Agent": "FederalLedger/1.0 (+https://federal-ledger-west-tech.vercel.app/)"},
            )
            response.raise_for_status()
            rows = response.json()
            if not isinstance(rows, list):
                raise ValueError("Montgomery County permit API returned a non-list response")
            for row in rows:
                if not isinstance(row, dict) or not row.get("permitno"):
                    continue
                yield row
                yielded += 1
            if len(rows) < remaining or (limit is not None and yielded >= limit):
                break
            offset += len(rows)

    def normalize(self, row: dict[str, Any], *, observed_at: datetime | None = None) -> dict[str, Any]:
        observed = observed_at or datetime.now(timezone.utc)
        permit_number = str(row["permitno"]).strip()
        permit_filter = quote(f"permitno='{permit_number}'")
        source_url = f"{RESOURCE_URL}?%24where={permit_filter}"
        content_hash = payload_hash(row)
        latitude, longitude = _coordinates(row)
        relevance = classify_commercial_permit(row)
        return {
            "permit_fingerprint": stable_hash(self.source_system, permit_number),
            "source_record_fingerprint": stable_hash(self.source_system, permit_number, content_hash),
            "source_system": self.source_system,
            "source_document_id": permit_number,
            "permit_number": permit_number,
            "jurisdiction": "Montgomery County, Maryland",
            "parcel_identifier": None,
            "address_line": _address(row),
            "city": str(row.get("city") or "").strip() or None,
            "county": "Montgomery County",
            "county_fips": "24031",
            "state_code": str(row.get("state") or "MD").strip().upper(),
            "postal_code": str(row.get("zip") or "").strip() or None,
            "country_code": "US",
            "permit_type": str(row.get("applicationtype") or "").strip() or None,
            "work_type": str(row.get("worktype") or "").strip() or None,
            "use_code": str(row.get("usecode") or "").strip() or None,
            "description": str(row.get("description") or "").strip() or None,
            "application_date": _date(row.get("addeddate")),
            "issue_date": _date(row.get("issueddate")),
            "final_date": _date(row.get("finaleddate")),
            "status": str(row.get("status") or "").strip() or None,
            "project_value": _decimal(row.get("declaredvaluation")),
            "currency": "USD" if _decimal(row.get("declaredvaluation")) is not None else None,
            "building_area": _decimal(row.get("buildingarea")),
            "applicant": None,
            "contractor": None,
            "developer": None,
            "property_owner": None,
            "verified_occupant": None,
            "latitude": latitude,
            "longitude": longitude,
            "relevance_score": relevance.score,
            "relevance_classification": relevance.classification,
            "relevance_reasons": list(relevance.reasons),
            "source_url": source_url,
            "content_hash": content_hash,
            "raw_payload": row,
            "first_observed_at": observed,
            "last_observed_at": observed,
        }

    @staticmethod
    def checkpoint(row: dict[str, Any]) -> str:
        return str(row.get("addeddate") or "")
