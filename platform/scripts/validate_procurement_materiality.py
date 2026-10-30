from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


PLATFORM = Path(__file__).resolve().parents[1]
if str(PLATFORM) not in sys.path:
    sys.path.insert(0, str(PLATFORM))

from procurement_materiality import evaluate_award_adjustment  # noqa: E402


def validate(database_url: str, *, limit: int) -> dict[str, object]:
    """Classify a bounded recent sample in an explicitly read-only transaction."""
    with psycopg.connect(database_url, row_factory=dict_row, connect_timeout=10) as connection:
        connection.execute("SET TRANSACTION READ ONLY")
        rows = connection.execute(
            """WITH sequenced AS (
                 SELECT t.*,
                        lag(t.current_total_value) OVER (
                          PARTITION BY t.award_id ORDER BY t.action_date NULLS LAST,t.created_at,t.id
                        ) AS prior_current_total_value
                 FROM transactions t WHERE NOT t.is_benchmark
               )
               SELECT c.slug AS company_slug,s.action_date::text,s.modification_number,s.obligation::text AS adjustment,
                      COALESCE(
                        NULLIF(abs(s.prior_current_total_value),0),
                        NULLIF(abs(s.current_total_value),0),
                        NULLIF(abs(a.current_value),0),
                        NULLIF(abs(a.potential_value),0),
                        NULLIF(abs(a.total_obligated),0)
                      )::text AS reference_award_value,
                      'USD'::text AS currency
               FROM sequenced s JOIN awards a ON a.id=s.award_id
               JOIN companies c ON c.id=a.recipient_company_id
               WHERE s.obligation IS NOT NULL
                 AND s.modification_number IS NOT NULL
                 AND btrim(s.modification_number) NOT IN ('','0','00','0000')
               ORDER BY s.action_date DESC NULLS LAST,s.created_at DESC
               LIMIT %s""",
            (limit,),
        ).fetchall()
        connection.rollback()

    counts: Counter[str] = Counter()
    examples: dict[str, list[dict[str, str | None]]] = {}
    for row in rows:
        result = evaluate_award_adjustment(row["adjustment"], row["reference_award_value"], row["currency"])
        counts[result.status] += 1
        if len(examples.setdefault(result.status, [])) < 2:
            examples[result.status].append({
                "company_slug": row["company_slug"],
                "action_date": row["action_date"],
                "modification_number": row["modification_number"],
                "adjustment": row["adjustment"],
                "reference_award_value": row["reference_award_value"],
                "materiality_percent": str(result.percent) if result.percent is not None else None,
            })
    return {"sample_size": len(rows), "classification_counts": dict(counts), "examples": examples}


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only validation of award-adjustment materiality.")
    parser.add_argument("--limit", type=int, default=500)
    args = parser.parse_args()
    if not 1 <= args.limit <= 5_000:
        parser.error("--limit must be between 1 and 5000")
    database_url = (
        os.getenv("PLATFORM_DATABASE_DIRECT_URL")
        or os.getenv("DATABASE_DIRECT_URL")
        or os.getenv("DATABASE_URL")
    )
    if not database_url:
        parser.error("PLATFORM_DATABASE_DIRECT_URL, DATABASE_DIRECT_URL, or DATABASE_URL is required")
    print(json.dumps(validate(database_url, limit=args.limit), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
