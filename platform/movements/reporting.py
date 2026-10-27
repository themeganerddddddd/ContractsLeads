from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class MovementQualityReporter:
    def __init__(self, connection):
        self.connection = connection

    def build(self) -> dict[str, Any]:
        overview = self.connection.execute(
            """SELECT count(*)::bigint AS events,
               count(DISTINCT event_fingerprint)::bigint AS unique_events,
               count(*) FILTER (WHERE primary_state IS NOT NULL)::bigint AS with_state,
               count(*) FILTER (WHERE primary_county_fips IS NOT NULL)::bigint AS with_county_fips,
               count(*) FILTER (WHERE verification_status='source_verified')::bigint AS source_verified,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM company_event_sources s WHERE s.event_id=company_events.id
               ))::bigint AS source_backed
               FROM company_events"""
        ).fetchone()
        source_rows = self.connection.execute(
            """SELECT d.source_system,d.name,d.official_url,d.license_name,d.last_success_at,d.last_record_count,
               d.quality_status,sc.status AS checkpoint_status,sc.records_seen,sc.records_written,
               sc.error_summary,sc.metadata AS checkpoint_metadata,sc.updated_at AS checkpoint_updated_at
               FROM data_sources d LEFT JOIN source_checkpoints sc
                 ON sc.source_system=d.source_system AND sc.checkpoint_key='current'
               WHERE d.source_system IN (
                 'maryland_warn','virginia_warn','maryland_commerce_press',
                 'montgomery_county_commercial_permits','sec_edgar_submissions','dc_basic_business_licenses'
               ) ORDER BY d.source_system"""
        ).fetchall()
        matches = self.connection.execute(
            "SELECT match_status,count(*)::bigint AS count FROM company_match_reviews GROUP BY match_status ORDER BY match_status"
        ).fetchall()
        revisions = self.connection.execute(
            """SELECT source_system,count(*)::bigint AS source_revisions,
               count(DISTINCT event_id)::bigint AS canonical_events
               FROM company_event_sources GROUP BY source_system ORDER BY source_system"""
        ).fetchall()
        permits = self.connection.execute(
            """SELECT count(*)::bigint AS permits,
               count(*) FILTER (WHERE relevance_classification <> 'not_relevant')::bigint AS relevant_permits,
               count(*) FILTER (WHERE verified_occupant IS NOT NULL)::bigint AS permits_with_verified_occupant,
               count(DISTINCT permit_fingerprint)::bigint AS unique_permits
               FROM development_permits"""
        ).fetchone()
        business_change = self.connection.execute(
            """SELECT
               (SELECT count(*) FROM business_establishments)::bigint AS establishments,
               (SELECT count(DISTINCT company_id) FROM business_establishments WHERE company_id IS NOT NULL)::bigint AS companies_represented,
               (SELECT count(*) FROM business_establishments WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::bigint AS geocoded_establishments,
               (SELECT count(*) FROM business_establishments WHERE company_id IS NOT NULL AND match_status IN ('auto_verified','approved'))::bigint AS verified_establishment_company_relationships,
               (SELECT count(*) FROM business_establishments WHERE company_id IS NULL OR match_status IN ('unresolved','candidate'))::bigint AS unresolved_establishments,
               (SELECT count(*) FROM business_change_outcomes WHERE outcome_type='establishment_opened')::bigint AS confirmed_openings,
               (SELECT count(*) FROM business_change_outcomes WHERE outcome_type='establishment_expanded')::bigint AS confirmed_expansions,
               (SELECT count(*) FROM business_change_outcomes WHERE outcome_type='establishment_relocated')::bigint AS confirmed_relocations,
               (SELECT count(*) FROM business_change_outcomes WHERE outcome_type='establishment_closed')::bigint AS confirmed_closings,
               (SELECT count(*) FROM business_change_outcomes WHERE outcome_type='establishment_contracted')::bigint AS confirmed_contractions,
               (SELECT count(*) FROM business_change_outcomes WHERE outcome_type='business_formed')::bigint AS confirmed_formations,
               (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY lead_time_days)
                FROM business_change_outcomes WHERE lead_time_days IS NOT NULL)::numeric AS median_lead_time_days"""
        ).fetchone()
        indication_rows = self.connection.execute(
            """SELECT assessment_type,count(*)::bigint AS count,
               count(*) FILTER (WHERE band='strong')::bigint AS strong
               FROM business_change_assessments GROUP BY assessment_type ORDER BY assessment_type"""
        ).fetchall()
        overview_dict = dict(overview)
        events = int(overview_dict.get("events") or 0)
        overview_dict["exact_duplicate_events"] = events - int(overview_dict.get("unique_events") or 0)
        overview_dict["source_backed_percent"] = round(100 * int(overview_dict.get("source_backed") or 0) / events, 2) if events else None
        overview_dict["state_geocoded_percent"] = round(100 * int(overview_dict.get("with_state") or 0) / events, 2) if events else None
        overview_dict["county_fips_percent"] = round(100 * int(overview_dict.get("with_county_fips") or 0) / events, 2) if events else None
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "overview": overview_dict,
            "sources": [dict(row) for row in source_rows],
            "company_matches": [dict(row) for row in matches],
            "source_revisions": [dict(row) for row in revisions],
            "permits": dict(permits),
            "business_change": dict(business_change),
            "business_change_indications": [dict(row) for row in indication_rows],
            "interpretation": {
                "duplicate_rate": "Exact event duplicates are prevented by event_fingerprint; multiple source revisions may validly map to one event.",
                "matching_quality": "Only approved identifier matches are authoritative. Pending and ambiguous rows require review.",
                "geographic_quality": "County FIPS is only expected where the official source reports a resolvable county.",
                "coverage": "Missing events cannot be interpreted as no company activity outside monitored sources.",
            },
        }

    @staticmethod
    def write(report: dict[str, Any], output_dir: Path) -> list[Path]:
        output_dir.mkdir(parents=True, exist_ok=True)
        json_path = output_dir / "company-movement-quality.json"
        markdown_path = output_dir / "company-movement-quality.md"
        json_path.write_text(json.dumps(report, indent=2, default=str) + "\n", encoding="utf-8")
        overview = report["overview"]
        lines = [
            "# Company movement quality report",
            "",
            f"Generated: {report['generated_at']}",
            "",
            f"- Canonical events: {overview['events']}",
            f"- Exact duplicate events: {overview['exact_duplicate_events']}",
            f"- Source-backed events: {overview['source_backed_percent'] if overview['source_backed_percent'] is not None else 'n/a'}%",
            f"- Events with state: {overview['state_geocoded_percent'] if overview['state_geocoded_percent'] is not None else 'n/a'}%",
            f"- Events with county FIPS: {overview['county_fips_percent'] if overview['county_fips_percent'] is not None else 'n/a'}%",
            f"- Source-verified events: {overview['source_verified']}",
            "",
            "## Sources",
            "",
        ]
        for source in report["sources"]:
            stats = source.get("checkpoint_metadata") or {}
            lines.append(
                f"- {source['name']}: {source.get('checkpoint_status') or 'not run'}, "
                f"seen {source.get('records_seen') or 0}, written {source.get('records_written') or 0}, "
                f"matched {stats.get('matched', 0)}, ambiguous {stats.get('ambiguous', 0)}, "
                f"unmatched {stats.get('unmatched', 0)}, failed {stats.get('failed', 0)}, "
                f"last success {source.get('last_success_at') or 'never'}"
            )
        lines.extend(["", "## Company matching", ""])
        if report["company_matches"]:
            for match in report["company_matches"]:
                lines.append(f"- {match['match_status']}: {match['count']}")
        else:
            lines.append("- No movement company-match review records.")
        permit = report["permits"]
        business_change = report["business_change"]
        lines.extend([
            "",
            "## Permits",
            "",
            f"- Canonical permits: {permit['permits']}",
            f"- Commercially relevant permits: {permit['relevant_permits']}",
            f"- Permits with a verified occupant: {permit['permits_with_verified_occupant']}",
            f"- Duplicate permit fingerprints: {int(permit['permits'] or 0) - int(permit['unique_permits'] or 0)}",
            "",
            "## Location-based business change",
            "",
            f"- Companies represented: {business_change['companies_represented']}",
            f"- Establishments: {business_change['establishments']}",
            f"- Precisely geocoded establishments: {business_change['geocoded_establishments']}",
            f"- Verified establishment-company relationships: {business_change['verified_establishment_company_relationships']}",
            f"- Unresolved establishments: {business_change['unresolved_establishments']}",
            f"- Confirmed openings: {business_change['confirmed_openings']}",
            f"- Confirmed expansions: {business_change['confirmed_expansions']}",
            f"- Confirmed relocations: {business_change['confirmed_relocations']}",
            f"- Confirmed closings: {business_change['confirmed_closings']}",
            f"- Confirmed contractions: {business_change['confirmed_contractions']}",
            f"- Confirmed formations: {business_change['confirmed_formations']}",
            f"- Median indication-to-confirmation lead time: {business_change['median_lead_time_days'] if business_change['median_lead_time_days'] is not None else 'insufficient historical outcomes'}",
            "",
            "### Indications",
            "",
            *(
                [f"- {row['assessment_type']}: {row['count']} total, {row['strong']} strong" for row in report["business_change_indications"]]
                or ["- No business-change assessments have been generated."]
            ),
            "",
            "## Interpretation",
            "",
            "Exact event duplicates are prevented by stable event fingerprints; source revisions are append-only. "
            "Unmatched and ambiguous company references remain in review queues. Geographic completeness is source-dependent, "
            "and missing events cannot be interpreted as no company activity.",
        ])
        markdown_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return [json_path, markdown_path]
