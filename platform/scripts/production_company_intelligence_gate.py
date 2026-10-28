from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg
from psycopg import sql


CANONICAL_TABLES = (
    "companies",
    "awards",
    "transactions",
    "procurement_processes",
    "procurement_events",
)

INTELLIGENCE_TABLES = (
    "company_events",
    "development_permits",
    "business_establishments",
    "business_licenses",
    "business_change_signals",
    "business_change_assessments",
    "business_change_outcomes",
    "company_discoveries",
)

REQUIRED_MIGRATIONS = (
    "0011a_storage_headroom.sql",
    "0012_company_movement_intelligence.sql",
    "0013_company_tracking_product.sql",
    "0014_company_change_intelligence.sql",
    "0015_location_business_change.sql",
    "0015a_storage_headroom.sql",
)


def database_url() -> str:
    value = os.getenv("PLATFORM_DATABASE_DIRECT_URL")
    if not value:
        raise SystemExit("PLATFORM_DATABASE_DIRECT_URL is required")
    return value


def table_counts(connection: psycopg.Connection, names: tuple[str, ...]) -> tuple[dict[str, int], list[str]]:
    counts: dict[str, int] = {}
    missing: list[str] = []
    for name in names:
        if connection.execute("SELECT to_regclass(%s)", (name,)).fetchone()[0] is None:
            missing.append(name)
            continue
        counts[name] = int(
            connection.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(name))).fetchone()[0]
        )
    return counts, missing


def grouped_counts(connection: psycopg.Connection, query: str) -> list[dict[str, object]]:
    cursor = connection.execute(query)
    columns = [column.name for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def snapshot(connection: psycopg.Connection, *, include_intelligence: bool) -> dict[str, object]:
    applied = [row[0] for row in connection.execute("SELECT name FROM schema_migrations ORDER BY name")]
    canonical_counts, missing_canonical = table_counts(connection, CANONICAL_TABLES)
    result: dict[str, object] = {
        "database_identity": {
            "database_name": connection.execute("SELECT current_database()").fetchone()[0],
            "branch_id": connection.execute("SELECT current_setting('neon.branch_id', true)").fetchone()[0],
            "project_id": connection.execute("SELECT current_setting('neon.project_id', true)").fetchone()[0],
        },
        "canonical_counts": canonical_counts,
        "missing_canonical_tables": missing_canonical,
        "database_size_bytes": int(connection.execute("SELECT pg_database_size(current_database())").fetchone()[0]),
        "applied_migrations": applied,
    }
    if include_intelligence:
        intelligence_counts, missing_intelligence = table_counts(connection, INTELLIGENCE_TABLES)
        result["intelligence_counts"] = intelligence_counts
        result["missing_intelligence_tables"] = missing_intelligence
        if not missing_intelligence:
            result["source_counts"] = grouped_counts(
                connection,
                """SELECT source_system,count(*)::bigint AS records
                   FROM company_events GROUP BY source_system
                   UNION ALL SELECT source_system,count(*)::bigint FROM development_permits GROUP BY source_system
                   UNION ALL SELECT source_system,count(*)::bigint FROM business_licenses GROUP BY source_system
                   ORDER BY source_system""",
            )
            result["business_change_categories"] = grouped_counts(
                connection,
                """SELECT 'signal' AS layer,signal_type AS category,count(*)::bigint AS records
                   FROM business_change_signals GROUP BY signal_type
                   UNION ALL SELECT 'assessment',assessment_type || ':' || band,count(*)::bigint
                   FROM business_change_assessments GROUP BY assessment_type,band
                   UNION ALL SELECT 'outcome',outcome_type,count(*)::bigint
                   FROM business_change_outcomes GROUP BY outcome_type
                   UNION ALL SELECT 'discovery',discovery_reason,count(*)::bigint
                   FROM company_discoveries GROUP BY discovery_reason
                   ORDER BY layer,category""",
            )
        else:
            result["source_counts"] = []
            result["business_change_categories"] = []
    return result


def write_snapshot(path: Path, result: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, default=str))


def verify(connection: psycopg.Connection, before_path: Path) -> None:
    before = json.loads(before_path.read_text(encoding="utf-8"))["canonical_counts"]
    after, missing_canonical = table_counts(connection, CANONICAL_TABLES)
    changes = {
        name: {"before": before[name], "after": after[name]}
        for name in CANONICAL_TABLES
        if name in after and int(before[name]) != after[name]
    }
    applied = {row[0] for row in connection.execute("SELECT name FROM schema_migrations")}
    missing = [name for name in REQUIRED_MIGRATIONS if name not in applied]
    result = {
        "canonical_counts": after,
        "missing_canonical_tables": missing_canonical,
        "unexpected_changes": changes,
        "missing_required_migrations": missing,
    }
    print(json.dumps(result, indent=2))
    if missing_canonical or changes or missing:
        raise SystemExit(2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Production company-intelligence migration and count gate")
    parser.add_argument("command", choices=("snapshot", "verify", "report"))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--before", type=Path)
    args = parser.parse_args()
    with psycopg.connect(database_url()) as connection:
        if args.command == "verify":
            if not args.before:
                parser.error("verify requires --before")
            verify(connection, args.before)
            return
        if not args.output:
            parser.error(f"{args.command} requires --output")
        write_snapshot(args.output, snapshot(connection, include_intelligence=args.command == "report"))


if __name__ == "__main__":
    main()
