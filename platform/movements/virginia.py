from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Iterable
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from .maryland import USER_AGENT, _clean, _date_range, _integer, _parse_date
from .models import MovementEnvelope, NormalizedMovement, payload_hash, stable_hash


WARN_URL = "https://virginiaworks.gov/im-an-employer/retain-and-grow/warn-notices/"


def _locality(value: str | None) -> tuple[str | None, str]:
    cleaned = _clean(value)
    match = re.match(r"(.+?)(?:,\s*VA)?$", cleaned, re.I)
    city = _clean(match.group(1)) if match else cleaned
    return (city or None, "VA")


class VirginiaWarnAdapter:
    """Collect the official Virginia Works WARN table.

    Virginia publishes a statewide HTML table with direct links to many original
    notice documents. The table's Location column is treated as the affected
    locality. The address displayed below a company name is retained as raw
    source evidence but is not promoted to a worksite or headquarters address.
    """

    source_system = "virginia_warn"

    def __init__(self, url: str = WARN_URL, session: requests.Session | None = None):
        self.url = url
        self.session = session or requests.Session()

    def fetch(self, *, limit: int | None = None) -> Iterable[MovementEnvelope]:
        response = self.session.get(self.url, timeout=30, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        return self.parse_html(
            response.text,
            source_url=response.url,
            observed_at=datetime.now(timezone.utc),
            limit=limit,
        )

    @classmethod
    def parse_html(
        cls,
        html: str,
        *,
        source_url: str = WARN_URL,
        observed_at: datetime | None = None,
        limit: int | None = None,
    ) -> list[MovementEnvelope]:
        soup = BeautifulSoup(html, "html.parser")
        table = soup.find("table")
        if table is None:
            raise ValueError("Virginia WARN page did not contain the expected table")
        headings = [_clean(node.get_text(" ", strip=True)).casefold() for node in table.find_all("th")]
        required = {"company", "notice date", "impact date", "employees affected", "location", "notice type"}
        if not required.issubset(set(headings)):
            raise ValueError("Virginia WARN table columns changed")

        observed = observed_at or datetime.now(timezone.utc)
        envelopes: list[MovementEnvelope] = []
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 7:
                continue
            values = [_clean(cell.get_text(" ", strip=True)) for cell in cells]
            if not _parse_date(values[1]):
                continue
            company_link = cells[0].find("a", href=True)
            company_name = _clean(company_link.get_text(" ", strip=True)) if company_link else ""
            if not company_name:
                company_name = _clean(next(iter(cells[0].stripped_strings), ""))
            if not company_name:
                continue
            company_parts = [_clean(item) for item in cells[0].stripped_strings]
            company_address = ", ".join(item for item in company_parts if item and item != company_name) or None
            notice_url = urljoin(source_url, company_link["href"]) if company_link else source_url
            payload = {
                "company_name": company_name,
                "company_address": company_address,
                "notice_date": values[1],
                "impact_date": values[2],
                "employees_affected": values[3],
                "location": values[4],
                "notice_type": values[6],
                "notice_url": notice_url,
                "listing_url": source_url,
            }
            identifier = "va-warn-" + stable_hash(values[1], company_name, values[4])[:24]
            envelopes.append(MovementEnvelope(
                source_system=cls.source_system,
                document_identifier=identifier,
                source_url=notice_url,
                publisher="Virginia Works",
                publication_date=_parse_date(values[1]),
                observed_at=observed,
                source_type="official_warn_log",
                payload=payload,
            ))
            if limit is not None and len(envelopes) >= limit:
                break
        return envelopes

    def normalize(self, envelope: MovementEnvelope) -> NormalizedMovement:
        payload = envelope.payload
        company_name = _clean(payload.get("company_name"))
        notice_type = _clean(payload.get("notice_type"))
        jobs = _integer(payload.get("employees_affected"))
        start_date, end_date = _date_range(payload.get("impact_date"))
        event_type = "closure" if "clos" in notice_type.casefold() else "layoff"
        city, state_code = _locality(payload.get("location"))
        event_fingerprint = stable_hash(self.source_system, envelope.document_identifier, event_type)
        source_hash = payload_hash(payload)
        location = {
            "location_fingerprint": stable_hash(event_fingerprint, "affected_worksite", city, state_code),
            "location_role": "affected_worksite",
            "address_line": None,
            "city": city,
            "county": None,
            "county_fips": None,
            "state_code": state_code,
            "postal_code": None,
            "country_code": "US",
            "is_primary": True,
            "confidence": 0.92,
            "evidence": {
                "publisher_field": "Location",
                "company_address_retained_only_as_raw_source_evidence": bool(payload.get("company_address")),
            },
        }
        return NormalizedMovement(
            event={
                "event_fingerprint": event_fingerprint,
                "source_system": self.source_system,
                "source_country": "US",
                "event_type": event_type,
                "event_subtype": notice_type or None,
                "event_status": "announced",
                "verification_status": "source_verified",
                "announced_date": envelope.publication_date,
                "event_date": start_date or envelope.publication_date,
                "effective_start_date": start_date,
                "effective_end_date": end_date,
                "title": f"{company_name}: {notice_type or 'workforce reduction notice'}",
                "summary": f"Virginia Works published a notice reporting {payload.get('employees_affected') or 'an unspecified number of'} employees affected in {payload.get('location') or 'Virginia'}.",
                "employment_change": -jobs if jobs is not None else None,
                "jobs_created": None,
                "jobs_affected": jobs,
                "capital_investment": None,
                "currency": None,
                "primary_state": state_code,
                "primary_county": None,
                "primary_county_fips": None,
                "primary_city": city,
                "primary_postal_code": None,
                "confidence": 0.94,
                "evidence": {
                    "notice_type": notice_type,
                    "employee_count_reported": payload.get("employees_affected"),
                    "impact_date_reported": payload.get("impact_date"),
                    "listing_url": payload.get("listing_url"),
                    "interpretation": "Official state WARN table entry; employee effects and dates are publisher-reported.",
                },
                "first_observed_at": envelope.observed_at,
                "last_observed_at": envelope.observed_at,
            },
            source={
                "source_record_fingerprint": stable_hash(self.source_system, envelope.document_identifier, source_hash),
                "source_system": self.source_system,
                "document_identifier": envelope.document_identifier,
                "content_hash": source_hash,
                "original_url": envelope.source_url,
                "publisher": envelope.publisher,
                "publication_date": envelope.publication_date,
                "collected_at": envelope.observed_at,
                "source_type": envelope.source_type,
                "record_status": "linked",
                "is_primary": True,
                "evidence_excerpt": " | ".join(
                    str(payload.get(key) or "")
                    for key in ("company_name", "location", "employees_affected", "impact_date", "notice_type")
                ),
                "raw_payload": payload,
                "license_name": None,
                "commercial_use_status": "unverified",
            },
            observed_company_name=company_name or None,
            location=location,
        )

    @staticmethod
    def checkpoint(envelope: MovementEnvelope) -> str:
        return envelope.document_identifier
