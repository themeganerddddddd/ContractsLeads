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
from .virginia import VirginiaWarnAdapter


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect official company movement evidence")
    parser.add_argument("command", choices=("sync", "permit-sync", "sec-sync", "assess", "quality-report"))
    parser.add_argument(
        "--source",
        choices=("all", "maryland-warn", "virginia-warn", "maryland-commerce"),
        default="all",
    )
    parser.add_argument("--limit", type=int, help="Bounded record count per source for validation")
    parser.add_argument("--since", type=date.fromisoformat, help="Permit application date lower bound (YYYY-MM-DD)")
    parser.add_argument("--as-of", type=date.fromisoformat, help="Assessment observation cutoff (YYYY-MM-DD)")
    parser.add_argument("--company-id", help="Assess one company instead of all companies with indicators")
    parser.add_argument("--output-dir", type=Path, default=Path("reports"), help="Quality report output directory")
    parser.add_argument(
        "--assessment-type",
        choices=("growth", "contraction", "relocation", "market_entry", "activity"),
        default="growth",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    settings = Settings.from_env()
    repository = MovementRepository(settings.database_url)
    try:
        choices = {
            "maryland-warn": [MarylandWarnAdapter()],
            "virginia-warn": [VirginiaWarnAdapter()],
            "maryland-commerce": [MarylandCommerceAdapter()],
            "all": [MarylandWarnAdapter(), VirginiaWarnAdapter(), MarylandCommerceAdapter()],
        }
        if args.command == "permit-sync":
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
