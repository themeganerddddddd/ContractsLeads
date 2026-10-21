from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path


def _json_value(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


class QualityReporter:
    """Database-backed diagnostics. Findings are evidence, never auto-merges."""

    def __init__(self, repository):
        self.connection = repository.connection

    def _rows(self, sql: str, params=()) -> list[dict]:
        return [dict(row) for row in self.connection.execute(sql, params).fetchall()]

    def build(self) -> dict:
        summary = self._rows(
            """SELECT
                 (SELECT count(*) FROM companies WHERE NOT is_demo AND NOT is_benchmark) AS companies,
                 (SELECT count(*) FROM awards WHERE NOT is_demo AND NOT is_benchmark) AS awards,
                 (SELECT count(*) FROM transactions WHERE NOT is_demo AND NOT is_benchmark) AS transactions,
                 (SELECT count(*) FROM raw_source_transactions) AS raw_source_transactions,
                 (SELECT count(*) FROM raw_source_transaction_versions) AS raw_source_versions,
                 (SELECT max(completed_at) FROM ingestion_runs WHERE status='success') AS last_successful_ingestion"""
        )[0]
        duplicates = {
            "uei": self._rows(
                """SELECT upper(uei) AS uei,count(*) AS company_rows,array_agg(id::text ORDER BY id::text) AS company_ids
                   FROM companies WHERE uei IS NOT NULL AND btrim(uei)<>'' GROUP BY upper(uei) HAVING count(*)>1"""
            ),
            "missing_uei_exact_identity": self._rows(
                """SELECT lower(legal_name) AS normalized_name,recipient_state,recipient_zip,count(*) AS company_rows,
                   array_agg(id::text ORDER BY id::text) AS company_ids FROM companies WHERE uei IS NULL
                   GROUP BY lower(legal_name),recipient_state,recipient_zip HAVING count(*)>1 ORDER BY count(*) DESC LIMIT 250"""
            ),
            "similar_names_different_uei_review": self._rows(
                """SELECT a.id::text AS company_a,b.id::text AS company_b,a.canonical_name AS name_a,b.canonical_name AS name_b,
                   a.uei AS uei_a,b.uei AS uei_b,similarity(a.canonical_name,b.canonical_name) AS similarity
                   FROM companies a JOIN companies b ON a.id<b.id AND a.uei IS NOT NULL AND b.uei IS NOT NULL
                   AND upper(a.uei)<>upper(b.uei) AND similarity(a.canonical_name,b.canonical_name)>=0.90
                   ORDER BY similarity DESC LIMIT 250"""
            ),
        }
        geography = {
            "company_conflicting_recipient_fips_review": self._rows(
                """SELECT company_id::text,count(DISTINCT recipient_county_fips) AS county_fips_count,
                   array_agg(DISTINCT recipient_county_fips) FILTER (WHERE recipient_county_fips IS NOT NULL) AS county_fips
                   FROM company_geography_observation_versions GROUP BY company_id
                   HAVING count(DISTINCT recipient_county_fips)>1 ORDER BY count(DISTINCT recipient_county_fips) DESC LIMIT 250"""
            ),
            "recipient_state_county_fips_mismatch": self._rows(
                """SELECT id::text,canonical_name,recipient_state_fips,recipient_county_fips FROM companies
                   WHERE recipient_state_fips IS NOT NULL AND recipient_county_fips IS NOT NULL
                   AND left(recipient_county_fips,2)<>recipient_state_fips LIMIT 250"""
            ),
            "performance_state_county_fips_mismatch": self._rows(
                """SELECT id::text,generated_award_id,performance_state_fips,performance_county_fips FROM awards
                   WHERE performance_state_fips IS NOT NULL AND performance_county_fips IS NOT NULL
                   AND left(performance_county_fips,2)<>performance_state_fips LIMIT 250"""
            ),
            "recipient_equals_performance_informational": self._rows(
                """SELECT count(*) AS awards FROM awards a JOIN companies c ON c.id=a.recipient_company_id
                   WHERE c.recipient_county_fips IS NOT NULL AND c.recipient_county_fips=a.performance_county_fips"""
            )[0],
            "identical_recipient_performance_review": self._rows(
                """SELECT a.id::text,a.generated_award_id,c.id::text AS company_id,c.canonical_name,
                   c.recipient_city,c.recipient_county_fips,c.recipient_zip
                   FROM awards a JOIN companies c ON c.id=a.recipient_company_id
                   WHERE c.recipient_county_fips IS NOT NULL AND c.recipient_county_fips=a.performance_county_fips
                   AND lower(COALESCE(c.recipient_city,''))=lower(COALESCE(a.performance_city,''))
                   AND COALESCE(c.recipient_zip,'')=COALESCE(a.performance_zip,'')
                   ORDER BY a.updated_at DESC LIMIT 250"""
            ),
        }
        award_transaction = {
            "representative_awards": self._rows(
                """SELECT a.id::text AS award_id,a.generated_award_id,a.piid,count(t.id) AS transaction_count,
                   sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS total_disclosed_obligations,
                   max(t.action_date) AS latest_action_date,c.canonical_name AS company,a.awarding_agency AS agency
                   FROM awards a JOIN companies c ON c.id=a.recipient_company_id
                   LEFT JOIN transactions t ON t.award_id=a.id
                   WHERE NOT a.is_demo AND NOT a.is_benchmark GROUP BY a.id,c.id
                   ORDER BY count(t.id) DESC,max(t.action_date) DESC NULLS LAST LIMIT 50"""
            ),
            "awards_without_transactions": self._rows(
                """SELECT a.id::text,a.generated_award_id,a.piid FROM awards a LEFT JOIN transactions t ON t.award_id=a.id
                   WHERE t.id IS NULL AND NOT a.is_demo AND NOT a.is_benchmark LIMIT 250"""
            ),
            "obligation_mismatch": self._rows(
                """SELECT a.id::text,a.generated_award_id,a.total_obligated,sum(t.obligation) AS transaction_obligations,
                   a.total_obligated-sum(t.obligation) AS difference FROM awards a JOIN transactions t ON t.award_id=a.id
                   WHERE NOT a.is_demo AND NOT a.is_benchmark GROUP BY a.id HAVING count(t.obligation)>0
                   AND abs(a.total_obligated-sum(t.obligation))>0.01 ORDER BY abs(a.total_obligated-sum(t.obligation)) DESC LIMIT 250"""
            ),
            "piid_identity_conflicts": self._rows(
                """SELECT piid,count(DISTINCT generated_award_id) AS generated_ids,count(DISTINCT recipient_uei) AS recipient_ueis
                   FROM award_identity_observations WHERE piid IS NOT NULL GROUP BY piid
                   HAVING count(DISTINCT generated_award_id)>1 OR count(DISTINCT recipient_uei)>1
                   ORDER BY count(DISTINCT generated_award_id) DESC LIMIT 250"""
            ),
            "transaction_id_duplicates": self._rows(
                """SELECT source_transaction_id,count(*) AS rows FROM transactions
                   GROUP BY source_transaction_id HAVING count(*)>1 LIMIT 250"""
            ),
        }
        industry = {
            "distribution": self._rows(
                """SELECT COALESCE(i.slug,'unclassified') AS industry,count(DISTINCT a.id) AS awards,
                   count(t.id) AS transactions,sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS disclosed_obligations
                   FROM awards a LEFT JOIN industries i ON i.id=a.primary_industry_id LEFT JOIN transactions t ON t.award_id=a.id
                   WHERE NOT a.is_demo AND NOT a.is_benchmark GROUP BY COALESCE(i.slug,'unclassified')
                   ORDER BY count(DISTINCT a.id) DESC"""
            ),
            "other_share": self._rows(
                """SELECT count(DISTINCT a.id) AS total_awards,
                   count(DISTINCT a.id) FILTER (WHERE i.slug='other' OR i.id IS NULL) AS other_awards,
                   CASE WHEN count(DISTINCT a.id)=0 THEN 0 ELSE
                     round(count(DISTINCT a.id) FILTER (WHERE i.slug='other' OR i.id IS NULL)::numeric/count(DISTINCT a.id),6)
                   END AS other_award_share
                   FROM awards a LEFT JOIN industries i ON i.id=a.primary_industry_id
                   WHERE NOT a.is_demo AND NOT a.is_benchmark"""
            )[0],
            "common_naics_mappings": self._rows(
                """SELECT a.naics,COALESCE(i.slug,'unclassified') AS industry,count(DISTINCT a.id) AS awards,
                   count(t.id) AS transactions,sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS disclosed_obligations
                   FROM awards a LEFT JOIN industries i ON i.id=a.primary_industry_id LEFT JOIN transactions t ON t.award_id=a.id
                   WHERE NOT a.is_demo AND NOT a.is_benchmark AND a.naics IS NOT NULL
                   GROUP BY a.naics,COALESCE(i.slug,'unclassified') ORDER BY count(t.id) DESC LIMIT 100"""
            ),
            "common_psc_mappings": self._rows(
                """SELECT a.psc,COALESCE(i.slug,'unclassified') AS industry,count(DISTINCT a.id) AS awards,
                   count(t.id) AS transactions,sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS disclosed_obligations
                   FROM awards a LEFT JOIN industries i ON i.id=a.primary_industry_id LEFT JOIN transactions t ON t.award_id=a.id
                   WHERE NOT a.is_demo AND NOT a.is_benchmark AND a.psc IS NOT NULL
                   GROUP BY a.psc,COALESCE(i.slug,'unclassified') ORDER BY count(t.id) DESC LIMIT 100"""
            ),
            "high_volume_other_codes": self._rows(
                """SELECT a.naics,a.psc,count(DISTINCT a.id) AS awards,count(t.id) AS transactions,
                   sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS disclosed_obligations
                   FROM awards a LEFT JOIN industries i ON i.id=a.primary_industry_id LEFT JOIN transactions t ON t.award_id=a.id
                   WHERE NOT a.is_demo AND NOT a.is_benchmark AND (i.slug='other' OR i.id IS NULL)
                   GROUP BY a.naics,a.psc ORDER BY count(t.id) DESC LIMIT 100"""
            ),
        }
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scope": "non-demo, non-benchmark rows unless a diagnostic explicitly says otherwise",
            "summary": summary,
            "duplicates": duplicates,
            "geography": geography,
            "award_transaction": award_transaction,
            "industry": industry,
        }

    @staticmethod
    def write(report: dict, output_dir: Path) -> tuple[Path, Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        json_path = output_dir / "data-quality-report.json"
        md_path = output_dir / "data-quality-report.md"
        json_path.write_text(json.dumps(report, indent=2, default=_json_value), encoding="utf-8")
        lines = [
            "# Federal Ledger data quality report",
            "",
            f"Generated: {report['generated_at']}",
            "",
            "Findings are review queues, not automatic company merges. Recipient and place-of-performance geography remain separate.",
            "",
            "## Inventory",
            "",
        ]
        for key, value in report["summary"].items():
            lines.append(f"- {key.replace('_', ' ').title()}: {value}")
        lines.extend([
            "",
            "## Representative award/transaction rollups",
            "",
            "| PIID | Transactions | Disclosed obligations | Latest action | Company | Agency |",
            "|---|---:|---:|---|---|---|",
        ])
        for row in report["award_transaction"]["representative_awards"][:20]:
            lines.append(
                f"| {row.get('piid') or row.get('generated_award_id') or '—'} | {row['transaction_count']} | "
                f"{row.get('total_disclosed_obligations') or '—'} | {row.get('latest_action_date') or '—'} | "
                f"{row['company']} | {row.get('agency') or '—'} |"
            )
        for section in ("duplicates", "geography", "award_transaction", "industry"):
            lines.extend(["", f"## {section.replace('_', ' ').title()}", ""])
            for name, value in report[section].items():
                count = len(value) if isinstance(value, list) else value
                lines.append(f"- {name.replace('_', ' ').title()}: {count}")
        md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return json_path, md_path
