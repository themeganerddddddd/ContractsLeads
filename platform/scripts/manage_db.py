from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


def database_url() -> str:
    value = os.getenv("PLATFORM_DATABASE_DIRECT_URL") or os.getenv("DATABASE_DIRECT_URL") or os.getenv("DATABASE_URL")
    if not value:
        raise SystemExit("PLATFORM_DATABASE_DIRECT_URL or DATABASE_URL is required (copy .env.example to .env and load it first)")
    return value


def migrate() -> None:
    migration_dir = ROOT / "db" / "migrations"
    with psycopg.connect(database_url()) as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        applied = {row[0] for row in connection.execute("SELECT name FROM schema_migrations")}
        for path in sorted(migration_dir.glob("*.sql")):
            if path.name in applied:
                continue
            try:
                connection.execute(path.read_text(encoding="utf-8"))
                connection.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
                # Commit each migration independently. This preserves migration
                # atomicity while allowing capacity-recovery migrations to
                # release storage before the next additive migration starts.
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            print(f"Applied {path.name}")


def seed() -> None:
    with psycopg.connect(database_url()) as connection:
        connection.execute((ROOT / "db" / "seeds" / "demo.sql").read_text(encoding="utf-8"))
        # The lifecycle migration may already be recorded as applied when demo
        # data is reseeded. Re-run its idempotent derivation so seeded awards
        # and transactions receive the same process/event representation as
        # subsequently ingested U.S. records.
        connection.execute(
            (ROOT / "db" / "migrations" / "0006_us_lifecycle_backfill.sql").read_text(encoding="utf-8")
        )
        connection.commit()
    print("Seeded clearly marked demonstration data")


def main() -> None:
    parser = argparse.ArgumentParser(description="Federal intelligence database utilities")
    parser.add_argument("command", choices=("migrate", "seed", "reset-demo"))
    args = parser.parse_args()
    if args.command == "migrate":
        migrate()
    elif args.command == "seed":
        migrate()
        seed()
    else:
        with psycopg.connect(database_url()) as connection:
            for table in ("transactions", "awards", "procurement_processes", "companies"):
                connection.execute(f"DELETE FROM {table} WHERE is_demo = true")
            connection.commit()
        seed()


if __name__ == "__main__":
    main()
