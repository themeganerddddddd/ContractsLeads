from __future__ import annotations

import time
from datetime import date
from typing import Any, Iterator

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


SEARCH_URL = "https://api.ted.europa.eu/v3/notices/search"
SEARCH_FIELDS = [
    "publication-number",
    "notice-identifier",
    "notice-version",
    "procedure-identifier",
    "notice-type",
    "notice-subtype",
    "publication-date",
    "dispatch-date",
    "buyer-name",
    "buyer-country",
    "organisation-identifier-buyer",
    "classification-cpv",
    "identifier-lot",
    "contract-identifier",
    "change-notice-version-identifier",
    "modification-previous-notice-identifier",
    "organisation-name-tenderer",
    "organisation-identifier-tenderer",
    "organisation-country-tenderer",
    "tendering-party-name",
    "result-value-notice",
    "result-value-cur-notice",
    "title-proc",
    "description-proc",
    "place-of-performance-country-lot",
    "place-of-performance-subdiv-lot",
    "deadline-receipt-tender-date-lot",
    "estimated-value-lot",
    "estimated-value-cur-lot",
]


class TEDSearchClient:
    """Public TED Search API v3 client using unlimited iteration pagination."""

    def __init__(self, search_url: str = SEARCH_URL, page_size: int = 100):
        self.search_url = search_url
        self.page_size = max(1, min(page_size, 250))
        self.session = requests.Session()
        retry = Retry(total=5, backoff_factor=1.5, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=("POST", "GET"))
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.headers.update({"User-Agent": "FederalLedger/0.3 (TED public data importer)", "Accept": "application/json"})

    @staticmethod
    def query(start: date, end: date) -> str:
        if end < start:
            raise ValueError("end must not precede start")
        return f"publication-date = ({start:%Y%m%d} <> {end:%Y%m%d})"

    def count(self, start: date, end: date) -> int:
        response = self.session.post(
            self.search_url,
            json={"query": self.query(start, end), "fields": ["publication-number"], "limit": 1, "paginationMode": "PAGE_NUMBER"},
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        return int(payload.get("totalNoticeCount") or payload.get("total") or 0)

    def iterate(self, start: date, end: date, *, limit: int | None = None) -> Iterator[dict[str, Any]]:
        emitted = 0
        token: str | None = None
        while True:
            body: dict[str, Any] = {
                "query": self.query(start, end),
                "fields": SEARCH_FIELDS,
                "limit": min(self.page_size, limit - emitted) if limit is not None else self.page_size,
                "paginationMode": "ITERATION",
                "onlyLatestVersions": False,
            }
            if token:
                body["iterationNextToken"] = token
            response = self.session.post(self.search_url, json=body, timeout=90)
            response.raise_for_status()
            payload = response.json()
            notices = payload.get("notices") or payload.get("results") or []
            for notice in notices:
                if limit is not None and emitted >= limit:
                    return
                yield notice
                emitted += 1
            token = payload.get("iterationNextToken")
            if not token or not notices or (limit is not None and emitted >= limit):
                return
            # Keep requests well within TED's published fair-use ceiling.
            time.sleep(0.15)

