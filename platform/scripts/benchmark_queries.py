from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

QUERIES = {
    "home_overview": """SELECT count(DISTINCT c.id),count(DISTINCT a.id),sum(a.total_obligated)
        FROM awards a JOIN companies c ON c.id=a.recipient_company_id""",
    "recent_awards": """SELECT a.id,a.award_date,c.canonical_name FROM awards a JOIN companies c ON c.id=a.recipient_company_id
        ORDER BY a.award_date DESC NULLS LAST LIMIT 50""",
    "largest_awards": """SELECT id,total_obligated FROM awards
        ORDER BY COALESCE(potential_value,current_value,total_obligated) DESC NULLS LAST LIMIT 50""",
    "contract_text_search": """SELECT a.id FROM awards a JOIN companies c ON c.id=a.recipient_company_id
        WHERE to_tsvector('english',coalesce(a.title,'') || ' ' || coalesce(a.description,''))
        @@ plainto_tsquery('english','benchmark contract') ORDER BY a.award_date DESC LIMIT 50""",
    "company_search": """SELECT c.id,c.canonical_name,count(a.id) FROM companies c
        LEFT JOIN awards a ON a.recipient_company_id=c.id
        WHERE c.canonical_name ILIKE '%Benchmark Company 00001%' GROUP BY c.id ORDER BY c.canonical_name LIMIT 50""",
    "recipient_county_filter": """SELECT count(DISTINCT c.id),count(DISTINCT a.id),sum(a.total_obligated)
        FROM companies c JOIN awards a ON a.recipient_company_id=c.id WHERE c.recipient_county_fips='24031'""",
    "performance_county_filter": """SELECT count(DISTINCT c.id),count(DISTINCT a.id),sum(a.total_obligated)
        FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE a.performance_county_fips='51059'""",
    "date_range_filter": """SELECT count(*),sum(total_obligated) FROM awards
        WHERE award_date BETWEEN '2024-01-01'::date AND '2024-12-31'::date""",
    "company_profile": """SELECT count(DISTINCT a.id),count(t.id),sum(a.total_obligated)
        FROM awards a LEFT JOIN transactions t ON t.award_id=a.id
        JOIN companies c ON c.id=a.recipient_company_id WHERE c.slug='benchmark-company-0000001'""",
    "location_flows": """SELECT count(DISTINCT c.id),count(DISTINCT a.id),sum(a.total_obligated)
        FROM awards a JOIN companies c ON c.id=a.recipient_company_id
        WHERE c.recipient_county_fips='24031' OR a.performance_county_fips='24031'""",
    "agency_contractors": """SELECT c.id,count(*),sum(a.total_obligated) FROM awards a
        JOIN companies c ON c.id=a.recipient_company_id WHERE a.awarding_agency='Benchmark Agency 01'
        GROUP BY c.id ORDER BY sum(a.total_obligated) DESC LIMIT 20""",
    "industry_profile": """SELECT a.awarding_agency,count(*),sum(a.total_obligated) FROM awards a
        WHERE a.primary_industry_id=(SELECT primary_industry_id FROM awards WHERE is_benchmark LIMIT 1)
        GROUP BY a.awarding_agency ORDER BY sum(a.total_obligated) DESC LIMIT 20""",
    "transaction_history": """SELECT t.* FROM transactions t JOIN awards a ON a.id=t.award_id
        WHERE a.generated_award_id='BENCH-AWARD-000000001' ORDER BY t.action_date DESC""",
}


def connection_url() -> str:
    value = os.getenv("PLATFORM_DATABASE_DIRECT_URL") or os.getenv("DATABASE_DIRECT_URL") or os.getenv("DATABASE_URL")
    if not value:
        raise SystemExit("PLATFORM_DATABASE_DIRECT_URL or DATABASE_URL is required")
    return value


def summarize(plan: dict) -> dict:
    root = plan["Plan"]
    indexes: list[str] = []

    def visit(node: dict) -> None:
        if node.get("Index Name"):
            indexes.append(node["Index Name"])
        for child in node.get("Plans", []):
            visit(child)

    visit(root)
    return {
        "planning_ms": plan.get("Planning Time"),
        "execution_ms": plan.get("Execution Time"),
        "root_node": root.get("Node Type"),
        "actual_rows": root.get("Actual Rows"),
        "shared_hit_blocks": root.get("Shared Hit Blocks"),
        "shared_read_blocks": root.get("Shared Read Blocks"),
        "indexes": sorted(set(indexes)),
        "plan": plan,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run EXPLAIN ANALYZE on Federal Ledger's major query shapes")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "reports")
    args = parser.parse_args()
    results = {}
    with psycopg.connect(connection_url()) as connection:
        inventory_row = connection.execute(
            """SELECT (SELECT count(*) FROM companies) AS companies,(SELECT count(*) FROM awards) AS awards,
               (SELECT count(*) FROM transactions) AS transactions,pg_database_size(current_database()) AS database_bytes,
               pg_size_pretty(pg_database_size(current_database())) AS database_size"""
        ).fetchone()
        inventory = dict(zip(("companies", "awards", "transactions", "database_bytes", "database_size"), inventory_row))
        for name, sql in QUERIES.items():
            payload = connection.execute(f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}").fetchone()[0][0]
            results[name] = summarize(payload)
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "inventory": inventory, "queries": results}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    json_path = args.output_dir / "benchmark-report.json"
    md_path = args.output_dir / "benchmark-report.md"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    lines = ["# Federal Ledger query benchmark", "", f"Generated: {report['generated_at']}", "", f"Inventory: {inventory}", "", "| Query | Execution ms | Root node | Indexes |", "|---|---:|---|---|"]
    for name, result in results.items():
        lines.append(f"| {name} | {result['execution_ms']:.3f} | {result['root_node']} | {', '.join(result['indexes']) or 'none'} |")
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"reports": [str(json_path), str(md_path)], "queries": len(results)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
