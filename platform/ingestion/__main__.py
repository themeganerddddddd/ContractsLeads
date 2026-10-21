from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from .backfill import BackfillRunner, USAspendingArchiveClient
from .config import Settings
from .golden_markets import GoldenMarketValidator, USAspendingMarketClient
from .quality import QualityReporter
from .repository import PostgresRepository
from .service import IngestionService
from .usaspending import USAspendingClient
from .uk import FindATenderAdapter, UKSyncService


def main() -> int:
    parser = argparse.ArgumentParser(description="Nationwide USAspending transaction importer")
    subparsers = parser.add_subparsers(dest="command", required=True)
    sync = subparsers.add_parser("sync", help="Import newly added or modified contract transactions")
    sync.add_argument("--start", type=date.fromisoformat, help="Inclusive last-modified date (YYYY-MM-DD)")
    sync.add_argument("--end", type=date.fromisoformat, help="Inclusive last-modified date (YYYY-MM-DD)")
    sync.add_argument("--limit", type=int, help="Optional bounded validation limit")
    uk_sync = subparsers.add_parser("uk-sync", help="Import official Find a Tender OCDS releases")
    uk_sync.add_argument("--start", type=date.fromisoformat, help="Inclusive updated date (YYYY-MM-DD)")
    uk_sync.add_argument("--end", type=date.fromisoformat, help="Inclusive updated date (YYYY-MM-DD)")
    uk_sync.add_argument("--limit", type=int, help="Optional bounded validation limit")
    reconcile = subparsers.add_parser("reconcile", help="Reprocess a recent action-date window")
    reconcile.add_argument("--days", type=int, default=None)
    reconcile.add_argument("--start", type=date.fromisoformat)
    reconcile.add_argument("--end", type=date.fromisoformat)
    backfill = subparsers.add_parser("backfill", help="Import official USAspending full contract archives")
    backfill.add_argument("--start", type=date.fromisoformat, required=True)
    backfill.add_argument("--end", type=date.fromisoformat, required=True)
    backfill.add_argument("--batch-size", type=int, default=None)
    backfill.add_argument("--cache-dir", type=Path, default=None)
    backfill.add_argument("--source-file", type=Path, help="Official-format ZIP/CSV fixture or pre-downloaded archive")
    backfill.add_argument("--max-records", type=int, help="Explicit bounded validation run; results remain partial")
    qa = subparsers.add_parser("qa", help="Write duplicate, geography, award, and industry diagnostics")
    qa.add_argument("--output-dir", type=Path, default=Path("reports"))
    validate = subparsers.add_parser("validate-markets", help="Validate representative local markets")
    validate.add_argument("--start", type=date.fromisoformat, required=True)
    validate.add_argument("--end", type=date.fromisoformat, required=True)
    validate.add_argument("--output-dir", type=Path, default=Path("reports"))
    validate.add_argument("--offline", action="store_true", help="Skip direct USAspending comparisons")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    settings = Settings.from_env()
    repository = PostgresRepository(settings.database_url)
    try:
        if args.command in ("sync", "reconcile"):
            client = USAspendingClient(settings.usaspending_base_url, settings.page_limit)
            service = IngestionService(repository, client, settings.overlap_days, batch_size=settings.batch_size)
            if args.command == "sync":
                if args.start or args.end:
                    if not (args.start and args.end):
                        raise ValueError("sync --start and --end must be provided together")
                    result = service.sync_window(args.start, args.end, max_records=args.limit)
                else:
                    result = service.sync(max_records=args.limit)
            elif args.start or args.end:
                if not (args.start and args.end):
                    raise ValueError("reconcile --start and --end must be provided together")
                result = service.reconcile_window(args.start, args.end)
            else:
                result = service.reconcile(args.days or settings.reconciliation_days)
        elif args.command == "uk-sync":
            end_date = args.end or date.today()
            start_date = args.start or (end_date - timedelta(days=1))
            if bool(args.start) != bool(args.end):
                raise ValueError("uk-sync --start and --end must be provided together")
            start_at = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
            end_at = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
            result = UKSyncService(repository, FindATenderAdapter()).sync(start_at, end_at, limit=args.limit)
        elif args.command == "backfill":
            archive_client = USAspendingArchiveClient(settings.usaspending_base_url)
            result = BackfillRunner(repository, archive_client).run(
                args.start,
                args.end,
                args.cache_dir or Path(settings.backfill_cache_dir),
                batch_size=args.batch_size or settings.batch_size,
                max_records=args.max_records,
                source_file=args.source_file,
            )
        elif args.command == "qa":
            report = QualityReporter(repository).build()
            paths = QualityReporter.write(report, args.output_dir)
            result = {"status": "success", "reports": [str(path) for path in paths], "summary": report["summary"]}
        else:
            source = None if args.offline else USAspendingMarketClient(settings.usaspending_base_url)
            report = GoldenMarketValidator(repository, source).build(args.start, args.end)
            paths = GoldenMarketValidator.write(report, args.output_dir)
            result = {"status": "success", "reports": [str(path) for path in paths]}
        print(json.dumps(result, indent=2, default=str))
        return 0 if result["status"] == "success" else 2
    except Exception as exc:
        print(f"Fatal ingestion failure: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        repository.close()


if __name__ == "__main__":
    raise SystemExit(main())
