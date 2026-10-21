from __future__ import annotations

import argparse
import math
import os
import sys
import time
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def connection_url() -> str:
    value = os.getenv("PLATFORM_DATABASE_DIRECT_URL") or os.getenv("DATABASE_DIRECT_URL") or os.getenv("DATABASE_URL")
    if not value:
        raise SystemExit("PLATFORM_DATABASE_DIRECT_URL or DATABASE_URL is required")
    return value


def require_safe_environment() -> None:
    if os.getenv("APP_ENV") == "production":
        raise SystemExit("benchmark data generation is disabled when APP_ENV=production")
    if os.getenv("ALLOW_BENCHMARK_DATA") != "true":
        raise SystemExit("set ALLOW_BENCHMARK_DATA=true explicitly; generated rows are synthetic")


def clean(connection: psycopg.Connection) -> None:
    connection.execute("DELETE FROM transactions WHERE is_benchmark")
    connection.execute("DELETE FROM awards WHERE is_benchmark")
    connection.execute("DELETE FROM companies WHERE is_benchmark")
    connection.commit()


def generate(connection: psycopg.Connection, rows: int, batch_size: int) -> dict:
    company_count = max(100, math.ceil(rows / 8))
    award_count = max(100, math.ceil(rows / 3))
    started = time.monotonic()
    industry = connection.execute("SELECT id FROM industries ORDER BY slug LIMIT 1").fetchone()
    if not industry:
        raise RuntimeError("seed the industry taxonomy before generating benchmark data")
    industry_id = industry[0]
    states = ("MD", "VA", "LA", "AL", "TX", "CA", "NY", "CO")
    counties = ("24031", "51059", "22071", "01089", "48201", "06037", "36061", "08031")

    for first in range(0, company_count, batch_size):
        values = []
        for index in range(first, min(first + batch_size, company_count)):
            position = index % len(states)
            values.append((
                f"BENCHUEI{index:010d}"[-12:], f"Synthetic Benchmark Company {index:07d} LLC",
                f"Synthetic Benchmark Company {index:07d} LLC", f"benchmark-company-{index:07d}",
                f"Benchmark City {index % 250}", f"Benchmark County {position}", counties[position], states[position],
                counties[position][:2], f"{10000 + index % 89999:05d}", industry_id,
            ))
        connection.cursor().executemany(
            """INSERT INTO companies (uei,legal_name,canonical_name,slug,recipient_city,recipient_county,
               recipient_county_fips,recipient_state,recipient_state_fips,recipient_zip,primary_industry_id,
               first_seen,last_seen,is_demo,is_benchmark)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,current_date,current_date,true,true)
               ON CONFLICT (slug) DO NOTHING""",
            values,
        )
        connection.commit()

    for first in range(0, award_count, batch_size):
        values = []
        for index in range(first, min(first + batch_size, award_count)):
            company_index = index % company_count
            position = index % len(states)
            values.append((
                f"BENCH-AWARD-{index:09d}", f"BENCH-{index:09d}", f"benchmark-company-{company_index:07d}",
                f"Synthetic benchmark contract {index:09d}", "Synthetic data for database performance testing only",
                f"Benchmark Agency {index % 24:02d}", f"Benchmark Subagency {index % 60:02d}",
                f"{541000 + index % 1000:06d}", f"D{index % 999:03d}", industry_id,
                f"{2018 + index % 9}-01-01", states[position], counties[position],
            ))
        connection.cursor().executemany(
            """INSERT INTO awards (generated_award_id,piid,recipient_company_id,title,description,awarding_agency,
               awarding_subagency,naics,psc,primary_industry_id,classification_confidence,award_date,
               performance_state,performance_county_fips,is_demo,is_benchmark)
               SELECT %s,%s,c.id,%s,%s,%s,%s,%s,%s,%s,1.0,%s::date,%s,%s,true,true FROM companies c WHERE c.slug=%s
               ON CONFLICT (generated_award_id) WHERE generated_award_id IS NOT NULL AND btrim(generated_award_id)<>'' DO NOTHING""",
            [
                (value[0], value[1], value[3], value[4], value[5], value[6], value[7], value[8],
                 value[9], value[10], value[11], value[12], value[2])
                for value in values
            ],
        )
        connection.commit()

    for first in range(0, rows, batch_size):
        values = []
        for index in range(first, min(first + batch_size, rows)):
            award_index = index % award_count
            values.append((
                f"BENCH-TX-{index:010d}", f"BENCH-AWARD-{award_index:09d}",
                f"{2018 + index % 9}-{1 + index % 12:02d}-{1 + index % 27:02d}",
                f"M{index % 50:03d}", str((index % 500_000) - 25_000),
            ))
        connection.cursor().executemany(
            """INSERT INTO transactions (source_transaction_id,award_id,action_date,modification_number,obligation,
               description,is_demo,is_benchmark)
               SELECT %s,a.id,%s::date,%s,%s::numeric,'Synthetic benchmark transaction',true,true
               FROM awards a WHERE a.generated_award_id=%s ON CONFLICT (source_transaction_id) DO NOTHING""",
            [(tx, action_date, mod, obligation, award_id) for tx, award_id, action_date, mod, obligation in values],
        )
        connection.commit()
    connection.execute(
        """UPDATE awards a SET total_obligated=s.total FROM (
             SELECT award_id,sum(obligation) AS total FROM transactions WHERE is_benchmark GROUP BY award_id
           ) s WHERE a.id=s.award_id AND a.is_benchmark"""
    )
    connection.commit()
    elapsed = max(time.monotonic() - started, 0.001)
    return {
        "companies": company_count,
        "awards": award_count,
        "transactions": rows,
        "elapsed_seconds": round(elapsed, 3),
        "transactions_per_second": round(rows / elapsed, 2),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate clearly marked synthetic scale data in PostgreSQL")
    parser.add_argument("command", choices=("generate", "clean"))
    parser.add_argument("--rows", type=int, default=100_000)
    parser.add_argument("--batch-size", type=int, default=2_000)
    args = parser.parse_args()
    require_safe_environment()
    if args.rows < 1 or args.batch_size < 1:
        raise SystemExit("rows and batch-size must be positive")
    with psycopg.connect(connection_url()) as connection:
        if args.command == "clean":
            clean(connection)
            print("Removed synthetic benchmark rows")
        else:
            clean(connection)
            print(generate(connection, args.rows, args.batch_size))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
