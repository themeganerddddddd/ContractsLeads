from __future__ import annotations

import argparse
import json
import os
from datetime import date
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

from .capacity import CapacityGuard
from archive.backend import LocalArchiveBackend, S3CompatibleBackend
from archive.features import FEATURE_DATASETS, FeatureExportService
from archive.retention import RetentionService


def _database_url() -> str:
    value = os.getenv("PLATFORM_DATABASE_DIRECT_URL") or os.getenv("DATABASE_DIRECT_URL") or os.getenv("DATABASE_URL")
    if not value:
        raise SystemExit("PLATFORM_DATABASE_DIRECT_URL or DATABASE_URL is required")
    return value


def _archive_backend(local_root: str | None):
    if local_root:
        return LocalArchiveBackend(Path(local_root))
    bucket = os.getenv("ARCHIVE_S3_BUCKET", "").strip()
    if not bucket:
        raise SystemExit("Set --local-root for local archives or configure ARCHIVE_S3_BUCKET for S3-compatible storage")
    try:
        import boto3  # type: ignore[import-not-found]
    except ImportError as exc:
        raise SystemExit("Install the optional boto3 package before using an S3-compatible archive backend") from exc
    client = boto3.client(
        "s3",
        endpoint_url=os.getenv("ARCHIVE_S3_ENDPOINT") or None,
        region_name=os.getenv("ARCHIVE_S3_REGION") or None,
    )
    return S3CompatibleBackend(client, bucket, os.getenv("ARCHIVE_S3_PREFIX", ""))


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser(description="BusinessCurrent operational reports")
    subparsers = parser.add_subparsers(dest="command", required=True)
    report = subparsers.add_parser("storage-report", help="Measure database, table, index, and raw storage")
    report.add_argument("--json", action="store_true")
    plan = subparsers.add_parser("retention-plan", help="Read-only report of records eligible for archive")
    plan.add_argument("--json", action="store_true")
    plan.add_argument("--as-of", type=date.fromisoformat)
    archive = subparsers.add_parser("retention-archive", help="Archive a bounded batch without pruning PostgreSQL")
    archive.add_argument("--source", required=True, help="source_retention_policies.source_key")
    archive.add_argument("--limit", type=int, default=1000)
    archive.add_argument("--as-of", type=date.fromisoformat)
    archive.add_argument("--local-root", help="credential-free local object-store root")
    archive.add_argument("--execute", action="store_true", help="required acknowledgement for archive writes")
    feature_plan = subparsers.add_parser("feature-export-plan", help="Read-only annual Parquet export row count")
    feature_plan.add_argument("--dataset", required=True, choices=sorted(FEATURE_DATASETS))
    feature_plan.add_argument("--year", required=True, type=int)
    feature = subparsers.add_parser("feature-export", help="Export a bounded annual feature dataset to verified Parquet")
    feature.add_argument("--dataset", required=True, choices=sorted(FEATURE_DATASETS))
    feature.add_argument("--year", required=True, type=int)
    feature.add_argument("--local-root", help="credential-free local object-store root")
    feature.add_argument("--execute", action="store_true", help="required acknowledgement for object and manifest writes")
    args = parser.parse_args()

    with psycopg.connect(_database_url(), row_factory=dict_row) as connection:
        if args.command == "retention-plan":
            result = RetentionService(connection).plan(as_of=args.as_of)
            payload = [item.__dict__ for item in result]
            if args.json:
                print(json.dumps(payload, indent=2, default=str))
            else:
                print("Retention plan (read only; no payloads were archived or pruned)")
                for item in result:
                    status = "permanent" if item.permanent else f"cutoff {item.cutoff}"
                    print(
                        f"  {item.source_key}: {item.records_eligible:,} records; "
                        f"{item.estimated_payload_bytes:,} estimated payload bytes; {status}; "
                        f"archive required={item.archive_required}"
                    )
            return 0
        if args.command == "retention-archive":
            if not args.execute:
                raise SystemExit("retention-archive requires --execute; it uploads and writes manifests but never prunes")
            result = RetentionService(connection, _archive_backend(args.local_root)).archive(
                args.source, limit=args.limit, as_of=args.as_of,
            )
            print(json.dumps(result, indent=2, default=str))
            return 0
        if args.command == "feature-export-plan":
            result = FeatureExportService(connection).plan(args.dataset, args.year)
            print(json.dumps(result, indent=2, default=str))
            return 0
        if args.command == "feature-export":
            if not args.execute:
                raise SystemExit("feature-export requires --execute; it uploads Parquet and writes a manifest without deleting source rows")
            result = FeatureExportService(connection, _archive_backend(args.local_root)).export(args.dataset, args.year)
            print(json.dumps(result, indent=2, default=str))
            return 0
        guard = CapacityGuard(connection)
        result = guard.measure()
        utilization = result["utilization"]
        if utilization is None:
            decision, reason = "unconfigured", "capacity is not configured"
        elif utilization >= guard.thresholds.critical_fraction:
            decision, reason = "stop", f"utilization reached the {guard.thresholds.critical_fraction:.1%} critical threshold"
        elif utilization >= guard.thresholds.warning_fraction:
            decision, reason = "warning", f"utilization reached the {guard.thresholds.warning_fraction:.1%} warning threshold"
        else:
            decision, reason = "safe", "capacity is below the warning threshold"
        result.update({"decision": decision, "reason": reason})
    if args.json:
        print(json.dumps(result, indent=2, default=str))
    else:
        print(f"Database: {result['database_bytes']:,} bytes")
        print(f"Table data: {result['table_data_bytes']:,} bytes")
        print(f"Indexes: {result['index_bytes']:,} bytes")
        print(f"Configured capacity: {result['capacity_bytes'] or 'not configured'}")
        print(f"Utilization: {result['utilization_percent'] if result['utilization_percent'] is not None else 'unknown'}%")
        print(f"Raw/version storage: {result['raw_bytes']:,} bytes ({result['raw_share_percent']}%)")
        print("Storage classes (relation data; indexes reported separately):")
        print(f"  Normalized hot facts: {result['normalized_hot_bytes']:,}")
        print(f"  Raw payloads: {result['raw_payload_bytes']:,}")
        print(f"  Version history: {result['version_history_bytes']:,}")
        print(f"  Derived history: {result['derived_history_bytes']:,}")
        print(f"  Permanent data: {result['permanent_bytes']:,}")
        print(f"  Archive-eligible relation bytes: {result['archive_eligible_bytes']:,}")
        print(f"Decision: {result['decision']} — {result['reason']}")
        print("Counts:")
        for name, count in result["counts"].items():
            print(f"  {name}: {count:,}")
        print("Observed relation bytes per 100k rows (current average; not a projection):")
        for name, value in result["observed_relation_bytes_per_100k"].items():
            print(f"  {name}: {value:,}" if value is not None else f"  {name}: unavailable")
        print("Largest relations:")
        for row in result["relations"][:30]:
            print(
                f"  {row['name']}: {row['total_bytes']:,} "
                f"(data {row['data_bytes']:,}; indexes {row['index_bytes']:,}; "
                f"live {int(row.get('live_rows') or 0):,}; dead {int(row.get('dead_rows') or 0):,})"
            )
        print("Largest indexes:")
        for row in result["indexes"]:
            print(f"  {row['name']} on {row['table_name']}: {row['index_bytes']:,}; scans {row['scans']:,}")
    return 2 if result["decision"] == "stop" else 0


if __name__ == "__main__":
    raise SystemExit(main())
