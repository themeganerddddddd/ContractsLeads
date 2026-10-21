from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


@dataclass(frozen=True)
class GoldenMarket:
    slug: str
    name: str
    counties: tuple[tuple[str, str], ...]


GOLDEN_MARKETS = (
    GoldenMarket("montgomery-md", "Montgomery County, Maryland", (("MD", "24031"),)),
    GoldenMarket("orleans-la", "Orleans Parish, Louisiana", (("LA", "22071"),)),
    GoldenMarket("madison-al", "Madison County, Alabama", (("AL", "01089"),)),
    GoldenMarket(
        "northern-va",
        "Northern Virginia representative counties and independent city",
        (("VA", "51013"), ("VA", "51059"), ("VA", "51107"), ("VA", "51153"), ("VA", "51510")),
    ),
)


class USAspendingMarketClient:
    def __init__(self, base_url: str = "https://api.usaspending.gov"):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        retry = Retry(total=4, backoff_factor=0.8, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=("POST",))
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.headers.update({"User-Agent": "FederalLedger/0.2", "Accept": "application/json"})

    def _filters(self, market: GoldenMarket, start: date, end: date, geography: str) -> dict:
        location_key = "recipient_locations" if geography == "recipient" else "place_of_performance_locations"
        return {
            "time_period": [{"start_date": start.isoformat(), "end_date": end.isoformat()}],
            "award_type_codes": ["A", "B", "C", "D"],
            location_key: [
                {"country": "USA", "state": state, "county": county_fips[-3:]}
                for state, county_fips in market.counties
            ],
        }

    def _post(self, path: str, payload: dict) -> dict:
        response = self.session.post(f"{self.base_url}{path}", json=payload, timeout=90)
        response.raise_for_status()
        return response.json()

    def metrics(self, market: GoldenMarket, start: date, end: date, geography: str) -> dict:
        filters = self._filters(market, start, end, geography)
        count_data = self._post("/api/v2/download/count/", {"filters": filters})
        declared_count = int(count_data.get("calculated_transaction_count", count_data.get("calculated_count", 0)))
        if declared_count > 50_000:
            raise RuntimeError(
                f"{market.name} {geography} source comparison has {declared_count} transactions; split the window below 50,000"
            )
        recipients: set[str] = set()
        awards: set[str] = set()
        transaction_keys: set[tuple[str, ...]] = set()
        obligation = Decimal(0)
        page = 1
        while True:
            data = self._post(
                "/api/v2/search/spending_by_transaction/",
                {
                    "filters": filters,
                    "fields": [
                        "Award ID", "Recipient Name", "Recipient UEI", "Action Date", "Action Type",
                        "Transaction Amount", "Mod", "generated_internal_id", "internal_id"
                    ],
                    "page": page,
                    "limit": 100,
                    "sort": "internal_id",
                    "order": "asc",
                },
            )
            for row in data.get("results", []):
                recipients.add(str(row.get("Recipient UEI") or row.get("Recipient Name") or "Unknown recipient"))
                awards.add(str(row.get("generated_internal_id") or row.get("Award ID") or row.get("internal_id")))
                transaction_keys.add(tuple(str(row.get(key) or "") for key in (
                    "generated_internal_id", "internal_id", "Award ID", "Mod", "Action Date", "Action Type",
                    "Transaction Amount"
                )))
                if row.get("Transaction Amount") is not None:
                    obligation += Decimal(str(row["Transaction Amount"]))
            if not data.get("page_metadata", {}).get("hasNext"):
                break
            page += 1
        if len(transaction_keys) != declared_count:
            raise RuntimeError(
                f"USAspending count/enumeration mismatch for {market.name} {geography}: "
                f"count endpoint={declared_count}, distinct enumerated={len(transaction_keys)}"
            )
        return {
            "companies": len(recipients),
            "awards": len(awards),
            "transactions": declared_count,
            "disclosed_obligations": str(obligation),
        }


class GoldenMarketValidator:
    def __init__(
        self,
        repository,
        source_client: USAspendingMarketClient | None = None,
        legacy_moco_path: Path | None = None,
    ):
        self.connection = repository.connection
        self.source_client = source_client
        default_legacy = Path(__file__).resolve().parents[2] / "data" / "contracts.json"
        self.legacy_moco_path = legacy_moco_path or (default_legacy if default_legacy.exists() else None)

    def _legacy_moco(self, start: date, end: date, geography: str) -> dict | None:
        if not self.legacy_moco_path or not self.legacy_moco_path.exists():
            return None
        rows = json.loads(self.legacy_moco_path.read_text(encoding="utf-8"))
        location_flag = "recipient_in_moco" if geography == "recipient" else "performance_in_moco"
        selected = []
        for row in rows:
            raw_date = row.get("action_date") or row.get("announcement_date")
            try:
                action_date = date.fromisoformat(str(raw_date)[:10])
            except (TypeError, ValueError):
                continue
            if start <= action_date <= end and row.get(location_flag) is True:
                selected.append(row)
        companies = {
            str(row.get("company", {}).get("uei") or row.get("company", {}).get("company_id") or row.get("company", {}).get("legal_name"))
            for row in selected
        }
        awards = {
            str(row.get("award", {}).get("award_id") or row.get("award", {}).get("contract_number") or row.get("id"))
            for row in selected
        }
        obligation = Decimal(0)
        for row in selected:
            value = row.get("award", {}).get("amount")
            if value is not None:
                obligation += Decimal(str(value))
        return {
            "companies": len(companies), "awards": len(awards), "transactions": len(selected),
            "disclosed_obligations": str(obligation),
        }

    def _local(self, market: GoldenMarket, start: date, end: date, geography: str) -> dict:
        fips = [county for _, county in market.counties]
        location = "c.recipient_county_fips=ANY(%s)" if geography == "recipient" else "a.performance_county_fips=ANY(%s)"
        base = f"""FROM transactions t JOIN awards a ON a.id=t.award_id JOIN companies c ON c.id=a.recipient_company_id
                   WHERE {location} AND t.action_date BETWEEN %s AND %s
                   AND NOT a.is_demo AND NOT a.is_benchmark AND NOT t.is_demo AND NOT t.is_benchmark"""
        values = (fips, start, end)
        metrics = dict(
            self.connection.execute(
                f"""SELECT count(DISTINCT c.id) AS companies,count(DISTINCT a.id) AS awards,count(DISTINCT t.id) AS transactions,
                    COALESCE(sum(t.obligation),0) AS disclosed_obligations {base}""",
                values,
            ).fetchone()
        )
        top_companies = [dict(row) for row in self.connection.execute(
            f"""SELECT c.canonical_name AS name,c.uei,count(DISTINCT a.id) AS awards,COALESCE(sum(t.obligation),0) AS disclosed_obligations
                {base} GROUP BY c.id ORDER BY disclosed_obligations DESC LIMIT 20""", values
        ).fetchall()]
        top_agencies = [dict(row) for row in self.connection.execute(
            f"""SELECT COALESCE(a.awarding_agency,'Unknown') AS name,count(DISTINCT a.id) AS awards,
                COALESCE(sum(t.obligation),0) AS disclosed_obligations {base}
                GROUP BY COALESCE(a.awarding_agency,'Unknown') ORDER BY disclosed_obligations DESC LIMIT 20""", values
        ).fetchall()]
        industry_base = base.replace("WHERE", "LEFT JOIN industries i ON i.id=a.primary_industry_id WHERE", 1)
        top_industries = [dict(row) for row in self.connection.execute(
            f"""SELECT COALESCE(i.name,'Unclassified') AS name,count(DISTINCT a.id) AS awards,
                COALESCE(sum(t.obligation),0) AS disclosed_obligations {industry_base}
                GROUP BY COALESCE(i.name,'Unclassified') ORDER BY disclosed_obligations DESC LIMIT 20""", values
        ).fetchall()]
        return {**metrics, "top_companies": top_companies, "top_agencies": top_agencies, "top_industries": top_industries}

    @staticmethod
    def _comparison(local: dict, source: dict | None) -> dict:
        if source is None:
            return {"status": "not_run", "reason": "source comparison disabled"}
        fields = ("companies", "awards", "transactions", "disclosed_obligations")
        differences = {}
        flagged = False
        for field in fields:
            local_value = Decimal(str(local[field]))
            source_value = Decimal(str(source[field]))
            difference = local_value - source_value
            relative = abs(difference) / abs(source_value) if source_value else (Decimal(0) if not local_value else Decimal(1))
            tolerance = Decimal("0.005") if field == "disclosed_obligations" else Decimal("0.01")
            is_flagged = relative > tolerance
            flagged = flagged or is_flagged
            differences[field] = {
                "local": str(local_value), "source": str(source_value), "difference": str(difference),
                "relative_difference": str(relative), "flagged": is_flagged,
            }
        return {
            "status": "review" if flagged else "within_tolerance",
            "note": "A flag may indicate incomplete local coverage or source revision timing; investigate before labeling it a bug.",
            "differences": differences,
        }

    def build(self, start: date, end: date) -> dict:
        markets = []
        for market in GOLDEN_MARKETS:
            modes = {}
            for geography in ("recipient", "performance"):
                local = self._local(market, start, end, geography)
                source = self.source_client.metrics(market, start, end, geography) if self.source_client else None
                result = {"local": local, "source": source, "comparison": self._comparison(local, source)}
                if market.slug == "montgomery-md":
                    legacy = self._legacy_moco(start, end, geography)
                    result["moco_legacy"] = legacy
                    result["moco_legacy_comparison"] = self._comparison(local, legacy)
                modes[geography] = result
            markets.append({"slug": market.slug, "name": market.name, "counties": market.counties, "geographies": modes})
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "start": start.isoformat(),
            "end": end.isoformat(),
            "methodology": "Transaction action date; distinct awards/companies; disclosed transaction obligations; recipient and performance geographies reported separately. Montgomery County also compares the existing MoCoLeads snapshot when its date coverage overlaps.",
            "markets": markets,
        }

    @staticmethod
    def write(report: dict, output_dir: Path) -> tuple[Path, Path]:
        def encode(value):
            if isinstance(value, Decimal):
                return str(value)
            raise TypeError(type(value).__name__)

        output_dir.mkdir(parents=True, exist_ok=True)
        json_path = output_dir / "golden-market-validation.json"
        md_path = output_dir / "golden-market-validation.md"
        json_path.write_text(json.dumps(report, indent=2, default=encode), encoding="utf-8")
        lines = ["# Golden-market validation", "", report["methodology"], "", f"Window: {report['start']} through {report['end']}"]
        for market in report["markets"]:
            lines.extend(["", f"## {market['name']}", ""])
            for geography, result in market["geographies"].items():
                local = result["local"]
                lines.append(
                    f"- {geography.title()}: {local['companies']} companies, {local['awards']} awards, "
                    f"{local['transactions']} transactions, {local['disclosed_obligations']} disclosed obligations; "
                    f"source comparison: {result['comparison']['status']}"
                )
                if result.get("moco_legacy_comparison"):
                    lines.append(f"  - Existing MoCoLeads comparison: {result['moco_legacy_comparison']['status']}")
        md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return json_path, md_path
