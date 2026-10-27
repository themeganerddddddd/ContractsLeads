from __future__ import annotations

import argparse
import json
import logging
from datetime import date
from pathlib import Path

from ingestion.config import Settings

from .maryland import MarylandCommerceAdapter, MarylandWarnAdapter
from .permits import MontgomeryCountyPermitAdapter
from .dc import DcBasicBusinessLicenseAdapter
from .repository import MovementRepository
from .reporting import MovementQualityReporter
from .sec import SecSubmissionsAdapter
from .scoring import build_movement_assessment
from .change_intelligence import MODEL_VERSION as CHANGE_MODEL_VERSION, build_change_assessment
from .formation import MODEL_VERSION as FORMATION_MODEL_VERSION, build_formation_snapshot
from .outcomes import event_outcome, registration_outcome, validate_outcomes
from .service import LicenseIngestionService, MovementIngestionService, PermitIngestionService
from .tracking import CompanyTrackingService
from .virginia import VirginiaWarnAdapter
from .validation import build_snapshot_match_report, write_snapshot_match_report


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect official company movement evidence")
    parser.add_argument(
        "command",
        choices=(
            "sync", "permit-sync", "license-sync", "sec-sync", "assess", "assess-v1", "outcomes-build", "outcomes-validate",
            "formation-build", "quality-report", "snapshot-match-report",
            "track-company", "update-tracking", "monitor-tracked", "review-match",
        ),
    )
    parser.add_argument(
        "--source",
        choices=("all", "maryland-warn", "virginia-warn", "maryland-commerce", "dc-basic-business-licenses"),
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
        choices=("expansion", "relocation", "growth", "contraction", "market_entry", "closure_distress", "activity"),
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
    if args.source == "dc-basic-business-licenses" and args.command not in {"license-sync"}:
        parser.error("--source dc-basic-business-licenses is supported by license-sync")
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
        elif args.command == "license-sync":
            if args.source not in {"all", "dc-basic-business-licenses"}:
                parser.error("license-sync supports --source dc-basic-business-licenses")
            result = LicenseIngestionService(repository).sync(
                DcBasicBusinessLicenseAdapter(), limit=args.limit
            )
        elif args.command == "sec-sync":
            result = MovementIngestionService(repository).sync_all(
                [SecSubmissionsAdapter(repository.sec_targets())], limit=args.limit
            )
        elif args.command in {"assess", "assess-v1"}:
            as_of = args.as_of or date.today()
            if args.command == "assess-v1" and args.assessment_type not in {"growth", "contraction", "relocation", "market_entry", "activity"}:
                parser.error("assess-v1 supports only the original v1 assessment types")
            company_ids = [args.company_id] if args.company_id else (
                repository.indicator_company_ids() if args.command == "assess-v1" else repository.change_company_ids()
            )
            written = 0
            sufficient = 0
            alerts = 0
            for company_id in company_ids:
                previous_score = repository.latest_change_score(company_id, args.assessment_type) if args.command == "assess" else None
                builder = build_movement_assessment if args.command == "assess-v1" else build_change_assessment
                signals = (
                    repository.movement_indicators_for_company(company_id, as_of)
                    if args.command == "assess-v1" else repository.change_signals_for_company(company_id, as_of)
                )
                assessment = builder(company_id, signals, as_of_date=as_of, assessment_type=args.assessment_type)
                written += int(repository.persist_movement_assessment(assessment))
                sufficient += int(assessment["data_sufficiency"] == "sufficient")
                if args.command == "assess":
                    alerts += repository.persist_indication_alert(assessment, previous_score)
            result = {
                "status": "success",
                "companies_assessed": len(company_ids),
                "assessments_written": written,
                "sufficient": sufficient,
                "alerts_written": alerts,
                "model_version": "movement-indication-v1" if args.command == "assess-v1" else CHANGE_MODEL_VERSION,
            }
        elif args.command == "outcomes-build":
            candidates = [event_outcome(row) for row in repository.outcome_candidates()]
            candidates.extend(registration_outcome(row) for row in repository.registration_candidates())
            qualifying = [row for row in candidates if row]
            written = sum(int(repository.persist_outcome(row)) for row in qualifying)
            counts: dict[str, int] = {}
            for row in qualifying:
                counts[row["outcome_type"]] = counts.get(row["outcome_type"], 0) + 1
            result = {
                "status": "success", "qualifying_outcomes": len(qualifying),
                "outcomes_written": written, "counts": counts,
            }
        elif args.command == "outcomes-validate":
            validation = validate_outcomes(repository.all_outcomes())
            result = {"status": "success" if validation["valid"] else "failed", **validation}
        elif args.command == "formation-build":
            as_of = (args.as_of or date.today()).replace(day=1)
            cells = repository.formation_cells(as_of)
            written = 0
            sufficient = 0
            for cell in cells:
                snapshot = build_formation_snapshot(
                    as_of_month=as_of,
                    country_code=cell["country_code"],
                    state_code=cell.get("state_code"),
                    county_fips=cell.get("county_fips"),
                    industry_code=cell["industry_code"],
                    industry_label=cell.get("industry_label"),
                    observations={**cell, "coverage": {"business_registration": "available"}},
                )
                written += int(repository.persist_formation_snapshot(snapshot))
                sufficient += int(snapshot["data_sufficiency"] == "sufficient")
            result = {
                "status": "success", "as_of_month": as_of, "cells_evaluated": len(cells),
                "snapshots_written": written, "sufficient": sufficient, "model_version": FORMATION_MODEL_VERSION,
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
