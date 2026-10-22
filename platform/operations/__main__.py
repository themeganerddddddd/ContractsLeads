from __future__ import annotations

import argparse
import json
import os

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

from .capacity import CapacityGuard


def _database_url() -> str:
    value = os.getenv("PLATFORM_DATABASE_DIRECT_URL") or os.getenv("DATABASE_DIRECT_URL") or os.getenv("DATABASE_URL")
    if not value:
        raise SystemExit("PLATFORM_DATABASE_DIRECT_URL or DATABASE_URL is required")
    return value


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Federal Ledger operational reports")
    subparsers = parser.add_subparsers(dest="command", required=True)
    report = subparsers.add_parser("storage-report", help="Measure database, table, index, and raw storage")
    report.add_argument("--json", action="store_true")
    args = parser.parse_args()
    with psycopg.connect(_database_url(), row_factory=dict_row) as connection:
        result = CapacityGuard(connection).check(
            source_system=None,
            operation="storage-report",
            historical=False,
            raise_on_stop=False,
        )
    if args.json:
        print(json.dumps(result, indent=2, default=str))
    else:
        print(f"Database: {result['database_bytes']:,} bytes")
        print(f"Configured capacity: {result['capacity_bytes'] or 'not configured'}")
        print(f"Utilization: {result['utilization_percent'] if result['utilization_percent'] is not None else 'unknown'}%")
        print(f"Raw/version storage: {result['raw_bytes']:,} bytes ({result['raw_share_percent']}%)")
        print(f"Decision: {result['decision']} — {result['reason']}")
        print("Largest relations:")
        for row in result["relations"][:20]:
            print(f"  {row['name']}: {row['total_bytes']:,} (data {row['data_bytes']:,}; indexes {row['index_bytes']:,})")
    return 2 if result["decision"] == "stop" else 0


if __name__ == "__main__":
    raise SystemExit(main())
