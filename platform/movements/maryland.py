from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from .models import MovementEnvelope, NormalizedMovement, payload_hash, stable_hash


WARN_URL = "https://www.labor.maryland.gov/employment/warn.shtml"
COMMERCE_URL = "https://commerce.maryland.gov/press-room"
USER_AGENT = "FederalLedger/1.0 (+https://federal-ledger-west-tech.vercel.app/)"

MARYLAND_COUNTY_FIPS = {
    "allegany": "24001", "anne arundel": "24003", "baltimore": "24005",
    "calvert": "24009", "caroline": "24011", "carroll": "24013",
    "cecil": "24015", "charles": "24017", "dorchester": "24019",
    "frederick": "24021", "garrett": "24023", "harford": "24025",
    "howard": "24027", "kent": "24029", "montgomery": "24031",
    "prince george s": "24033", "queen anne s": "24035", "st mary s": "24037",
    "somerset": "24039", "talbot": "24041", "washington": "24043",
    "wicomico": "24045", "worcester": "24047", "baltimore city": "24510",
}


def _clean(value: str | None) -> str:
    return " ".join((value or "").replace("\xa0", " ").split())


def _parse_date(value: str | None) -> date | None:
    cleaned = _clean(value)
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def _date_range(value: str | None) -> tuple[date | None, date | None]:
    matches = re.findall(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b", _clean(value))
    dates = [_parse_date(item) for item in matches]
    parsed = [item for item in dates if item]
    return (parsed[0] if parsed else None, parsed[1] if len(parsed) > 1 else None)


def _integer(value: str | None) -> int | None:
    match = re.search(r"\d[\d,]*", _clean(value))
    return int(match.group(0).replace(",", "")) if match else None


def _county_key(value: str | None) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", " ", _clean(value).casefold())
    return re.sub(r"\bcounty\b", " ", cleaned).strip()


def _county_fips(value: str | None) -> str | None:
    return MARYLAND_COUNTY_FIPS.get(_county_key(value))


def _address_parts(address: str) -> dict[str, str | None]:
    state_match = re.search(r"\b(MD|Maryland)\s*,?\s*(\d{5}(?:-\d{4})?)?\b", address, re.I)
    zip_match = re.search(r"\b(\d{5}(?:-\d{4})?)\b", address)
    return {
        "address_line": address or None,
        "city": None,
        "state_code": "MD" if state_match else None,
        "postal_code": zip_match.group(1) if zip_match else None,
    }


class MarylandWarnAdapter:
    source_system = "maryland_warn"

    def __init__(self, url: str = WARN_URL, session: requests.Session | None = None):
        self.url = url
        self.session = session or requests.Session()

    def fetch(self, *, limit: int | None = None) -> Iterable[MovementEnvelope]:
        response = self.session.get(self.url, timeout=30, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        # The Labor page currently omits a charset and Requests otherwise assumes
        # ISO-8859-1 even though the response bytes are UTF-8.
        html = response.content.decode("utf-8", errors="replace")
        return self.parse_html(html, source_url=response.url, observed_at=datetime.now(timezone.utc), limit=limit)

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
            raise ValueError("Maryland WARN page did not contain the expected table")
        observed = observed_at or datetime.now(timezone.utc)
        envelopes: list[MovementEnvelope] = []
        for row in table.find_all("tr"):
            cells = [_clean(cell.get_text(" ", strip=True)) for cell in row.find_all("td")]
            if len(cells) != 8 or not _parse_date(cells[0]):
                continue
            notice_date, naics, company, location, local_area, employees, effective, notice_type = cells
            identity_name = re.sub(r"\*?rescinded\*?", "", company, flags=re.I).strip()
            document_identifier = "md-warn-" + stable_hash(notice_date, identity_name, location)[:24]
            payload = {
                "notice_date": notice_date,
                "naics": naics or None,
                "company": company,
                "company_name": identity_name,
                "location": location,
                "local_area": local_area,
                "employees": employees,
                "effective_date": effective,
                "notice_type": notice_type,
            }
            envelopes.append(MovementEnvelope(
                source_system=cls.source_system,
                document_identifier=document_identifier,
                source_url=source_url,
                publisher="Maryland Department of Labor",
                publication_date=_parse_date(notice_date),
                observed_at=observed,
                source_type="official_warn_log",
                payload=payload,
            ))
            if limit is not None and len(envelopes) >= limit:
                break
        return envelopes

    def normalize(self, envelope: MovementEnvelope) -> NormalizedMovement:
        payload = envelope.payload
        notice_type = _clean(payload.get("notice_type"))
        company_name = _clean(payload.get("company_name"))
        jobs = _integer(payload.get("employees"))
        start_date, end_date = _date_range(payload.get("effective_date"))
        rescinded = "rescinded" in f"{payload.get('company', '')} {notice_type}".casefold()
        lowered_type = notice_type.casefold()
        event_type = "closure" if "closure" in lowered_type else "furlough" if "furlough" in lowered_type else "layoff"
        county = _clean(payload.get("local_area")) or None
        event_fingerprint = stable_hash(self.source_system, envelope.document_identifier, event_type)
        source_hash = payload_hash(payload)
        location = _address_parts(_clean(payload.get("location")))
        location.update({
            "location_fingerprint": stable_hash(event_fingerprint, "affected_worksite", payload.get("location"), county),
            "location_role": "affected_worksite",
            "county": county,
            "county_fips": _county_fips(county),
            "state_code": location.get("state_code") or "MD",
            "country_code": "US",
            "is_primary": True,
            "confidence": 0.94,
            "evidence": {"publisher_field": "Location", "jurisdiction_field": "Local Area"},
        })
        return NormalizedMovement(
            event={
                "event_fingerprint": event_fingerprint,
                "source_system": self.source_system,
                "source_country": "US",
                "event_type": event_type,
                "event_subtype": notice_type or None,
                "event_status": "rescinded" if rescinded else "announced",
                "verification_status": "source_verified",
                "announced_date": envelope.publication_date,
                "event_date": start_date or envelope.publication_date,
                "effective_start_date": start_date,
                "effective_end_date": end_date,
                "title": f"{company_name}: {notice_type or 'workforce reduction notice'}",
                "summary": f"Maryland published a dislocation notice affecting {payload.get('employees') or 'an unspecified number of'} employees at the reported worksite.",
                "employment_change": -jobs if jobs is not None else None,
                "jobs_created": None,
                "jobs_affected": jobs,
                "capital_investment": None,
                "currency": None,
                "primary_state": "MD",
                "primary_county": county,
                "primary_county_fips": _county_fips(county),
                "primary_city": None,
                "primary_postal_code": location.get("postal_code"),
                "confidence": 0.94,
                "evidence": {
                    "notice_type": notice_type,
                    "naics": payload.get("naics"),
                    "employee_count_reported": payload.get("employees"),
                    "effective_date_reported": payload.get("effective_date"),
                    "interpretation": "Publisher log entry; inclusion does not independently establish federal WARN eligibility.",
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
                "evidence_excerpt": " | ".join(str(payload.get(key) or "") for key in ("company", "location", "employees", "effective_date", "notice_type")),
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


EXPANSION_TERMS = re.compile(
    r"\b(expan(?:d|ds|ded|ding|sion)|new (?:facility|headquarters|distribution center)|"
    r"open(?:s|ing)? (?:a )?new|create(?:s|d|ing)? [\w, -]*jobs|invest(?:s|ment|ing)?)\b",
    re.I,
)


def _company_from_title(title: str) -> str | None:
    patterns = (
        r"Announces\s+(.+?)\s+(?:Chooses|Expansion|Expands|Growth|Facility Expansion|to Invest|Will Invest)",
        r"Announce\s+(.+?)\s+(?:to Invest|Expansion|Expands)",
        r"New (?:Maryland )?Headquarters (?:and [^ ]+ )?for\s+(.+?)(?:\s+in\s+|$)",
        r"Announces New\s+(.+?)\s+(?:Headquarters|Facility|Distribution Center)",
    )
    for pattern in patterns:
        match = re.search(pattern, title, re.I)
        if match:
            return _clean(match.group(1)).strip(" ,:-") or None
    return None


def _money(text: str) -> tuple[Decimal | None, str | None]:
    match = re.search(r"\$\s*(\d+(?:\.\d+)?)\s*(billion|million|b|m)\b", text, re.I)
    if not match:
        return None, None
    multiplier = Decimal("1000000000") if match.group(2).casefold() in {"b", "billion"} else Decimal("1000000")
    return Decimal(match.group(1)) * multiplier, "USD"


def _announced_jobs(text: str) -> int | None:
    patterns = (
        r"(?:add(?:ing)?|create(?:s|d|ing)?|bring(?:ing)?|generate|support)\s+(?:more than |over |nearly |approximately |up to )?(\d[\d,]*)\s+(?:new )?jobs",
        r"(\d[\d,]*)\s+new jobs",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return int(match.group(1).replace(",", ""))
    return None


class MarylandCommerceAdapter:
    source_system = "maryland_commerce_press"

    def __init__(self, url: str = COMMERCE_URL, session: requests.Session | None = None):
        self.url = url
        self.session = session or requests.Session()

    @classmethod
    def parse_listing_html(cls, html: str, *, base_url: str = COMMERCE_URL) -> list[dict[str, Any]]:
        soup = BeautifulSoup(html, "html.parser")
        items: list[dict[str, Any]] = []
        for article in soup.select("article.maryland-listing-item__news"):
            link = article.select_one("a.maryland-listing-item__title[href]")
            if not link:
                continue
            title = _clean(link.get_text(" ", strip=True))
            if not EXPANSION_TERMS.search(title):
                continue
            time_node = article.find("time")
            date_text = _clean(time_node.get_text(" ", strip=True)) if time_node else ""
            if not date_text:
                date_match = re.search(r"[A-Z][a-z]+ \d{1,2}, \d{4}", article.get_text(" ", strip=True))
                date_text = date_match.group(0) if date_match else ""
            items.append({"title": title, "url": urljoin(base_url, link["href"]), "publication_date": date_text})
        return items

    @classmethod
    def parse_detail_html(cls, html: str, listing: dict[str, Any]) -> dict[str, Any]:
        soup = BeautifulSoup(html, "html.parser")
        title_node = soup.find("h1")
        title = _clean(title_node.get_text(" ", strip=True)) if title_node else listing["title"]
        time_node = soup.find("time")
        published = _clean(time_node.get_text(" ", strip=True)) if time_node else listing.get("publication_date", "")
        paragraphs = [
            _clean(node.get_text(" ", strip=True))
            for node in soup.select("main p, article p")
            if len(_clean(node.get_text(" ", strip=True))) >= 40
        ]
        summary = next((text for text in paragraphs if re.search(r"\b(announc|expand|open|invest|job)\w*\b", text, re.I)), paragraphs[0] if paragraphs else title)
        external_names: list[str] = []
        for node in soup.select("main p a[href], article p a[href]"):
            host = urlparse(urljoin(listing["url"], node.get("href", ""))).netloc.casefold()
            name = _clean(node.get_text(" ", strip=True))
            if name and "maryland.gov" not in host and not host.endswith("md.gov"):
                external_names.append(name)
        return {
            "title": title,
            "url": listing["url"],
            "publication_date": published,
            "summary": summary,
            "company_name": external_names[0] if external_names else _company_from_title(title),
            "body_excerpt": "\n".join(paragraphs[:4]),
        }

    def fetch(self, *, limit: int | None = None) -> Iterable[MovementEnvelope]:
        listing_response = self.session.get(self.url, timeout=30, headers={"User-Agent": USER_AGENT})
        listing_response.raise_for_status()
        listings = self.parse_listing_html(listing_response.text, base_url=listing_response.url)
        observed = datetime.now(timezone.utc)
        for index, listing in enumerate(listings):
            if limit is not None and index >= limit:
                break
            try:
                detail_response = self.session.get(listing["url"], timeout=30, headers={"User-Agent": USER_AGENT})
                detail_response.raise_for_status()
                payload = self.parse_detail_html(detail_response.text, listing)
                source_url = detail_response.url
            except requests.RequestException as exc:
                payload = {**listing, "summary": listing["title"], "company_name": _company_from_title(listing["title"]), "detail_fetch_error": type(exc).__name__}
                source_url = listing["url"]
            identifier = "md-commerce-" + stable_hash(source_url)[:24]
            yield MovementEnvelope(
                source_system=self.source_system,
                document_identifier=identifier,
                source_url=source_url,
                publisher="Maryland Department of Commerce",
                publication_date=_parse_date(payload.get("publication_date")),
                observed_at=observed,
                source_type="official_economic_development_announcement",
                payload=payload,
            )

    def normalize(self, envelope: MovementEnvelope) -> NormalizedMovement:
        payload = envelope.payload
        title = _clean(payload.get("title"))
        summary = _clean(payload.get("summary")) or title
        evidence_text = f"{title} {summary} {_clean(payload.get('body_excerpt'))}"
        company_name = _clean(payload.get("company_name")) or None
        jobs = _announced_jobs(evidence_text)
        investment, currency = _money(evidence_text)
        county_match = re.search(
            r"\b([A-Z][A-Za-z’'\-]*(?:\s+[A-Z][A-Za-z’'\-]*){0,3}) County\b",
            evidence_text,
        )
        county = _clean(county_match.group(1)) if county_match else None
        lowered = evidence_text.casefold()
        movement_claim = f"{title} {summary}"
        headquarters_move = re.search(
            r"\bnew\b.{0,30}\bheadquarters\b|"
            r"\b(?:relocat\w*|mov\w*)\b.{0,50}\bheadquarters\b|"
            r"\bheadquarters\b.{0,50}\b(?:relocat\w*|mov\w*)\b",
            movement_claim,
            re.I,
        )
        if headquarters_move:
            event_type, location_role = "headquarters_move", "headquarters"
        elif re.search(r"\bexpand\w*\s+(?:its\s+|the\s+)?headquarters\b", movement_claim, re.I):
            event_type, location_role = "facility_expansion", "expanded_facility"
        elif re.search(
            r"\bnew\s+(?:[a-z-]+\s+){0,4}(?:facility|plant|warehouse|distribution center)\b|"
            r"\b(?:open\w*|build\w*|construct\w*)\b.{0,50}\bnew\b.{0,50}\b(?:facility|plant|warehouse|distribution center)\b",
            movement_claim,
            re.I,
        ):
            event_type, location_role = "new_facility", "new_facility"
        elif "facility expansion" in lowered:
            event_type, location_role = "facility_expansion", "expanded_facility"
        else:
            event_type, location_role = "expansion", "destination"
        event_fingerprint = stable_hash(self.source_system, envelope.document_identifier, event_type)
        source_hash = payload_hash(payload)
        location = {
            "location_fingerprint": stable_hash(event_fingerprint, location_role, county, "MD"),
            "location_role": location_role,
            "address_line": None,
            "city": None,
            "county": county,
            "county_fips": _county_fips(county),
            "state_code": "MD",
            "postal_code": None,
            "country_code": "US",
            "is_primary": True,
            "confidence": 0.85 if county else 0.70,
            "evidence": {"county_extracted_from_official_release": bool(county)},
        }
        return NormalizedMovement(
            event={
                "event_fingerprint": event_fingerprint,
                "source_system": self.source_system,
                "source_country": "US",
                "event_type": event_type,
                "event_subtype": "official_economic_development_announcement",
                "event_status": "announced",
                "verification_status": "source_verified",
                "announced_date": envelope.publication_date,
                "event_date": envelope.publication_date,
                "effective_start_date": None,
                "effective_end_date": None,
                "title": title,
                "summary": summary,
                "employment_change": jobs,
                "jobs_created": jobs,
                "jobs_affected": None,
                "capital_investment": investment,
                "currency": currency,
                "primary_state": "MD",
                "primary_county": county,
                "primary_county_fips": _county_fips(county),
                "primary_city": None,
                "primary_postal_code": None,
                "confidence": 0.90,
                "evidence": {
                    "company_name_reported": company_name,
                    "numeric_claims_are_announced": True,
                    "extraction": "official release title and lead paragraph",
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
                "evidence_excerpt": summary[:1000],
                "raw_payload": payload,
                "license_name": None,
                "commercial_use_status": "unverified",
            },
            observed_company_name=company_name,
            location=location,
        )

    @staticmethod
    def checkpoint(envelope: MovementEnvelope) -> str:
        return envelope.document_identifier
