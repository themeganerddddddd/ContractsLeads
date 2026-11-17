#!/usr/bin/env python3
"""Rebuild the small, public, no-database preview archive from checked-in records.

Usage from repository root:
  python platform/scripts/export_offline_snapshot.py --check
  python platform/scripts/export_offline_snapshot.py

No network requests, PostgreSQL connection, migrations, ingestion, or writes to Neon.
Only preselected public evidence fields are written; source contact details are excluded.
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INPUT_COMPANIES = ROOT / "data" / "companies.json"
INPUT_AWARDS = ROOT / "data" / "latest.json"
INPUT_METADATA = ROOT / "data" / "metadata.json"
OUTPUT = ROOT / "platform" / "web" / "data" / "public-snapshot.json"

def clean(value: object, limit: int = 300) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""

def public_url(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value if re.match(r"^https://[a-zA-Z0-9.-]+/", value) else ""

def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def build_snapshot() -> dict:
    companies = load(INPUT_COMPANIES)
    awards = load(INPUT_AWARDS)
    metadata = load(INPUT_METADATA)
    return {
        "lastUpdated": metadata.get("last_updated"),
        "scope": "Limited Montgomery County, Maryland source snapshot",
        "companies": [
            {
                "id": clean(c.get("company_id"), 100),
                "name": clean(c.get("canonical_name")),
                "legalName": clean(c.get("legal_name")),
                "sector": clean(c.get("sector")),
                "hqCity": clean(c.get("hq_city")),
                "hqState": clean(c.get("hq_state")),
                "hqCounty": clean(c.get("hq_county")),
                "hqVerified": bool(c.get("hq_verified")),
                "verificationDate": clean(c.get("last_verified"), 20),
                "uei": clean(c.get("uei"), 25),
                "website": public_url(c.get("website")),
                "sourceUrl": public_url(c.get("hq_source")),
            } for c in companies
        ],
        "awards": [
            {
                "id": clean(row.get("id"), 100),
                "company": clean((row.get("company") or {}).get("canonical_name")),
                "uei": clean((row.get("company") or {}).get("uei"), 25),
                "recipientState": clean((row.get("company") or {}).get("hq_state")),
                "recipientCounty": clean((row.get("company") or {}).get("hq_county")),
                "date": clean(row.get("action_date"), 20),
                "agency": clean((row.get("award") or {}).get("agency")),
                "description": clean((row.get("award") or {}).get("description"), 300),
                "awardId": clean((row.get("award") or {}).get("award_id"), 90),
                "amount": value if isinstance(value := (row.get("award") or {}).get("amount"), (int, float)) and not isinstance(value, bool) else None,
                "sourceUrl": public_url((row.get("source") or {}).get("source_url")),
            } for row in awards
        ],
    }

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate the current archive is in sync; do not write files")
    args = parser.parse_args()
    current = build_snapshot()
    if args.check:
        if not OUTPUT.exists() or load(OUTPUT) != current:
            print("Offline source snapshot is out of date; run export_offline_snapshot.py")
            return 1
        print(f"Verified offline archive: {len(current['companies'])} companies, {len(current['awards'])} award actions")
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {OUTPUT.relative_to(ROOT)}: {len(current['companies'])} companies, {len(current['awards'])} award actions")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
