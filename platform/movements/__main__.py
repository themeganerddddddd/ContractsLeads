from __future__ import annotations

import argparse
import json
import logging
from datetime import date
from pathlib import Path

from ingestion.config import Settings

from .maryland import MarylandCommerceAdapter, MarylandWarnAdapter
from .permits import MontgomeryCountyPermitAdapter
from .repository import MovementRepository
from .reporting import MovementQualityReporter
from .sec import SecSubmissionsAdapter
from .scoring import build_movement_assessment
from .service import MovementIngestionService, PermitIngestionService
from .tracking import CompanyTrackingService
from .virginia import VirginiaWarnAdapter
from .validation import build_snapshot_match_report, write_snapshot_match_report


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect official company movement evidence")
    parser.add_argument(
        "command",
        choices=(
            "sync", "permit-sync", "sec-sync", "assess", "quality-report", "snapshot-match-report",
            "track-company", "update-tracking", "monitor-tracked", "review-match",
        ),
    )
    parser.add_argument(
        "--source",
        choices=("all", "maryland-warn", "virginia-warn", "maryland-commerce"),
        default="all",
    )
    parser.add_argument("--limit", type=int, help="Bounded record count per source for validation")
    parser.add_argument("--since", type=date.fromisoformat, help="Permit application date lower bound (YYYY-MM-DD)")
    parser.add_argument("--as-of", type=date.fromisoformat, help="Assessment observation cutoff (YYYY-MM-DD)")
    parser.add_argument("--company-id", help="Assess one company instead of all companies with indicators")
    parser.add_argument("--review-id", help="Match-review UUID for review-match")
    parser.add_argument("--actor", default="cli", help="Auditable actor name for tracking/review changes")
    parser.add_argument("--notes", help="Analyst notes retained with the tracking or review action")
    parser.add_argument(
        "--tracking-status", choices=("active", "paused", "review_required", "archived"),
        help="New platform tracking status",
    )
    parser.add_argument(
        "--tracking-reason",
        choices=(
            "manually_added", "procurement_activity", "movement_signal", "permit_signal", "sec_signal",
            "saved_search_match", "analyst_review", "other",
        ),
        default="manually_added",
    )
    parser.add_argument("--priority", choices=("high", "normal", "low"), help="Tracking priority")
    parser.add_argument("--decision", choices=("approved", "rejected", "pending"), help="Match-review decision")
    parser.add_argument("--monitor-procurement", action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument("--monitor-movements", action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument("--monitor-permits", action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument("--monitor-sec", action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument("--output-dir", type=Path, default=Path("reports"), help="Quality report output directory")
    parser.add_argument(
        "--assessment-type",
        choices=("growth", "contraction", "relocation", "market_entry", "activity"),
        default="growth",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    choices = {
        "maryland-warn": [MarylandWarnAdapter()],
        "virginia-warn": [VirginiaWarnAdapter()],
        "maryland-commerce": [MarylandCommerceAdapter()],
        "all": [MarylandWarnAdapter(), VirginiaWarnAdapter(), MarylandCommerceAdapter()],
    }
    if args.command == "snapshot-match-report":
        contracts_path = Path(__file__).resolve().parents[2] / "data" / "contracts.json"
        contract_records = json.loads(contracts_path.read_text(encoding="utf-8"))
        movements = []
        source_runs = []
        for adapter in choices[args.source]:
            stats = {"source_system": adapter.source_system, "received": 0, "normalized": 0, "failed": 0}
            errors = []
            try:
                for envelope in adapter.fetch(limit=args.limit):
                    stats["received"] += 1
                    try:
                        movements.append(adapter.normalize(envelope))
                        stats["normalized"] += 1
                    except Exception as exc:
                        stats["failed"] += 1
                        if len(errors) < 10:
                            errors.append(f"{type(exc).__name__}: {exc}")
                stats["status"] = "partial" if stats["failed"] else "success"
            except Exception as exc:
                stats["status"] = "failed"
                stats["failed"] += 1
                errors.append(f"{type(exc).__name__}: {exc}")
            stats["errors"] = errors
            source_runs.append(stats)
        report = build_snapshot_match_report(contract_records, movements, source_runs=source_runs)
        paths = write_snapshot_match_report(report, args.output_dir)
        result = {"status": "success", "reports": [str(path) for path in paths], "summary": report["summary"]}
        print(json.dumps(result, indent=2, default=str))
        return 0
    settings = Settings.from_env()
    repository = MovementRepository(settings.database_url)
    try:
        tracking = CompanyTrackingService(repository.connection)
        if args.command == "track-company":
            if not args.company_id:
                parser.error("track-company requires --company-id")
            result = {
                "status": "success",
                "target": tracking.add_target(
                    args.company_id,
                    reason=args.tracking_reason,
                    priority=args.priority or "normal",
                    actor=args.actor,
                    notes=args.notes,
                    monitor_procurement=args.monitor_procurement if args.monitor_procurement is not None else True,
                    monitor_movements=args.monitor_movements if args.monitor_movements is not None else True,
                    monitor_permits=args.monitor_permits if args.monitor_permits is not None else True,
                    monitor_sec=args.monitor_sec if args.monitor_sec is not None else True,
                ),
            }
        elif args.command == "update-tracking":
            if not args.company_id:
                parser.error("update-tracking requires --company-id")
            flags = {
                key: value for key, value in {
                    "monitor_procurement": args.monitor_procurement,
                    "monitor_movements": args.monitor_movements,
                    "monitor_permits": args.monitor_permits,
                    "monitor_sec": args.monitor_sec,
                }.items() if value is not None
            }
            result = {
                "status": "success",
                "target": tracking.update_target(
                    args.company_id,
                    actor=args.actor,
                    status=args.tracking_status,
                    priority=args.priority,
                    notes=args.notes,
                    source_flags=flags,
                ),
            }
        elif args.command == "monitor-tracked":
            discoveries = tracking.materialize_discoveries(limit=args.limit or 1000)
            result = tracking.evaluate_active_targets(limit=args.limit)
            result["discoveries"] = discoveries
            saved_searches = tracking.evaluate_saved_searches(limit=args.limit or 1000)
            result["saved_searches"] = saved_searches
            if saved_searches["status"] == "partial":
                result["status"] = "partial"
        elif args.command == "review-match":
            if not args.review_id or not args.decision:
                parser.error("review-match requires --review-id and --decision")
            result = {
                "status": "success",
                "review": tracking.review_match(
                    args.review_id, decision=args.decision, actor=args.actor, notes=args.notes,
                ),
            }
        elif args.command == "permit-sync":
            result = PermitIngestionService(repository).sync(
                MontgomeryCountyPermitAdapter(), since=args.since, limit=args.limit
            )
        elif args.command == "sec-sync":
            result = MovementIngestionService(repository).sync_all(
                [SecSubmissionsAdapter(repository.sec_targets())], limit=args.limit
            )
        elif args.command == "assess":
            as_of = args.as_of or date.today()
            company_ids = [args.company_id] if args.company_id else repository.indicator_company_ids()
            written = 0
            sufficient = 0
            for company_id in company_ids:
                assessment = build_movement_assessment(
                    company_id,
                    repository.movement_indicators_for_company(company_id, as_of),
                    as_of_date=as_of,
                    assessment_type=args.assessment_type,
                )
                written += int(repository.persist_movement_assessment(assessment))
                sufficient += int(assessment["data_sufficiency"] == "sufficient")
            result = {
                "status": "success",
                "companies_assessed": len(company_ids),
                "assessments_written": written,
                "sufficient": sufficient,
                "model_version": "movement-indication-v1",
            }
        elif args.command == "quality-report":
            report = MovementQualityReporter(repository.connection).build()
            paths = MovementQualityReporter.write(report, args.output_dir)
            result = {"status": "success", "reports": [str(path) for path in paths], "overview": report["overview"]}
        else:
            result = MovementIngestionService(repository).sync_all(choices[args.source], limit=args.limit)
        print(json.dumps(result, indent=2, default=str))
        return 0 if result["status"] == "success" else 2
    finally:
        repository.close()


if __name__ == "__main__":
    raise SystemExit(main())
