from __future__ import annotations

from datetime import date
from typing import Iterator

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

FIELDS = [
    "Award ID", "Recipient Name", "Recipient UEI", "Action Date", "Action Type", "Transaction Amount",
    "Awarding Agency", "Awarding Sub Agency", "Transaction Description", "Award Type", "Mod", "NAICS", "PSC",
    "Recipient Location", "Primary Place of Performance", "internal_id", "generated_internal_id", "Issued Date",
]


class USAspendingClient:
    """Transaction-level client; it never loops over a registry of known companies."""

    def __init__(self, base_url: str = "https://api.usaspending.gov", page_limit: int = 100):
        self.url = f"{base_url.rstrip('/')}/api/v2/search/spending_by_transaction/"
        self.page_limit = page_limit
        self.session = requests.Session()
        retry = Retry(total=4, backoff_factor=0.8, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=("POST",))
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.headers.update({"User-Agent": "FederalContractIntelligence/0.1", "Accept": "application/json"})

    def iter_transactions(self, start: date, end: date, date_type: str = "last_modified_date") -> Iterator[dict]:
        page = 1
        while True:
            payload = {
                "filters": {
                    "time_period": [{"start_date": start.isoformat(), "end_date": end.isoformat(), "date_type": date_type}],
                    "award_type_codes": ["A", "B", "C", "D"],
                },
                "fields": FIELDS,
                "page": page,
                "limit": self.page_limit,
                "sort": "Action Date",
                "order": "asc",
            }
            response = self.session.post(self.url, json=payload, timeout=60)
            response.raise_for_status()
            data = response.json()
            yield from data.get("results", [])
            if not data.get("page_metadata", {}).get("hasNext"):
                return
            page += 1
