from __future__ import annotations

import os
import time as clock
from datetime import date, datetime, timezone
from typing import Any, Iterable

import requests

from .models import MovementEnvelope, NormalizedMovement, payload_hash, stable_hash


SUBMISSIONS_BASE = "https://data.sec.gov/submissions"
ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"
CAPITAL_FORMS = {"S-1", "S-1/A", "S-3", "S-3/A", "S-4", "S-4/A", "F-1", "F-1/A", "F-3", "F-3/A"}
RELEVANT_8K_ITEMS = {"1.01", "2.01", "2.03", "2.05", "2.06", "3.02", "5.02", "8.01"}


def _filing_subtype(form: str, items: str) -> str:
    item_set = {item.strip() for item in items.split(",") if item.strip()}
    if form in CAPITAL_FORMS:
        return "securities_registration_disclosure"
    if item_set & {"2.05", "2.06"}:
        return "restructuring_or_impairment_disclosure"
    if "3.02" in item_set:
        return "unregistered_equity_disclosure"
    if "2.01" in item_set:
        return "acquisition_or_disposition_disclosure"
    if "2.03" in item_set:
        return "financial_obligation_disclosure"
    if "1.01" in item_set:
        return "material_agreement_disclosure"
    if "5.02" in item_set:
        return "leadership_disclosure"
    return "other_material_disclosure"


class SecSubmissionsAdapter:
    source_system = "sec_edgar_submissions"

    def __init__(
        self,
        targets: list[dict[str, Any]],
        *,
        user_agent: str | None = None,
        session: requests.Session | None = None,
    ):
        self.targets = targets
        self.user_agent = user_agent or os.getenv("SEC_USER_AGENT", "")
        self.session = session or requests.Session()

    @staticmethod
    def parse_submissions(
        payload: dict[str, Any],
        target: dict[str, Any],
        *,
        observed_at: datetime | None = None,
    ) -> list[MovementEnvelope]:
        recent = ((payload.get("filings") or {}).get("recent") or {})
        accessions = recent.get("accessionNumber") or []
        observed = observed_at or datetime.now(timezone.utc)
        envelopes: list[MovementEnvelope] = []
        for index, accession in enumerate(accessions):
            def item(field: str) -> str:
                values = recent.get(field) or []
                return str(values[index] or "") if index < len(values) else ""

            form = item("form")
            items = item("items")
            item_set = {value.strip() for value in items.split(",") if value.strip()}
            if form not in CAPITAL_FORMS and not (form in {"8-K", "8-K/A"} and item_set & RELEVANT_8K_ITEMS):
                continue
            cik = str(target["cik"]).zfill(10)
            accession_clean = str(accession).replace("-", "")
            primary_document = item("primaryDocument")
            document_url = f"{ARCHIVES_BASE}/{int(cik)}/{accession_clean}/{primary_document}"
            filing_date = item("filingDate")
            filing_payload = {
                "accession_number": accession,
                "filing_date": filing_date,
                "report_date": item("reportDate") or None,
                "acceptance_datetime": item("acceptanceDateTime") or None,
                "form": form,
                "items": items or None,
                "primary_document": primary_document,
                "primary_document_description": item("primaryDocDescription") or None,
                "company_name": target["canonical_name"],
                "company_id": target.get("company_id"),
                "cik": cik,
            }
            try:
                published = date.fromisoformat(filing_date)
            except ValueError:
                published = None
            envelopes.append(MovementEnvelope(
                source_system=SecSubmissionsAdapter.source_system,
                document_identifier=str(accession),
                source_url=document_url,
                publisher="U.S. Securities and Exchange Commission",
                publication_date=published,
                observed_at=observed,
                source_type="official_regulatory_filing",
                payload=filing_payload,
            ))
        return envelopes

    def fetch(self, *, limit: int | None = None) -> Iterable[MovementEnvelope]:
        if self.targets and not self.user_agent:
            raise RuntimeError("SEC_USER_AGENT is required and must identify the organization and contact")
        yielded = 0
        for target in self.targets:
            cik = str(target["cik"]).zfill(10)
            response = self.session.get(
                f"{SUBMISSIONS_BASE}/CIK{cik}.json",
                timeout=30,
                headers={"User-Agent": self.user_agent, "Accept-Encoding": "gzip, deflate"},
            )
            response.raise_for_status()
            for envelope in self.parse_submissions(response.json(), target):
                if limit is not None and yielded >= limit:
                    return
                yield envelope
                yielded += 1
            clock.sleep(0.12)

    def normalize(self, envelope: MovementEnvelope) -> NormalizedMovement:
        payload = envelope.payload
        form = str(payload.get("form") or "")
        items = str(payload.get("items") or "")
        company_name = str(payload.get("company_name") or "").strip()
        subtype = _filing_subtype(form, items)
        source_hash = payload_hash(payload)
        event_fingerprint = stable_hash(self.source_system, envelope.document_identifier, "regulatory_disclosure")
        title = f"{company_name} filed {form} disclosure"
        item_note = f" covering items {items}" if items else ""
        return NormalizedMovement(
            event={
                "event_fingerprint": event_fingerprint,
                "source_system": self.source_system,
                "source_country": "US",
                "event_type": "regulatory_disclosure",
                "event_subtype": subtype,
                "event_status": "filed",
                "verification_status": "source_verified",
                "announced_date": envelope.publication_date,
                "event_date": envelope.publication_date,
                "effective_start_date": None,
                "effective_end_date": None,
                "title": title,
                "summary": f"SEC EDGAR reports a {form} filing{item_note}. The filing is evidence of a disclosure, not proof of a completed funding, facility, or employment outcome.",
                "employment_change": None,
                "jobs_created": None,
                "jobs_affected": None,
                "capital_investment": None,
                "currency": None,
                "primary_state": None,
                "primary_county": None,
                "primary_county_fips": None,
                "primary_city": None,
                "primary_postal_code": None,
                "confidence": 0.99,
                "evidence": {
                    "accession_number": payload.get("accession_number"),
                    "form": form,
                    "items": items or None,
                    "interpretation": "regulatory disclosure only",
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
                "evidence_excerpt": f"{form} {items}".strip(),
                "raw_payload": payload,
                "license_name": "U.S. Government Work",
                "commercial_use_status": "permitted",
            },
            observed_company_name=company_name or None,
            location=None,
            identifiers=({"system": "SEC_CIK", "value": str(payload["cik"]), "country_code": "US"},),
        )

    @staticmethod
    def checkpoint(envelope: MovementEnvelope) -> str:
        return envelope.document_identifier
