from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timezone

import psycopg
import pytest

from ingestion.industry import IndustryClassifier
from ingestion.normalize import normalize_transaction
from ingestion.repository import PostgresRepository


def repository_or_skip():
    url = os.getenv("PLATFORM_DATABASE_DIRECT_URL") or os.getenv("DATABASE_DIRECT_URL") or os.getenv("DATABASE_URL")
    if not url:
        pytest.skip("repository integration test requires PostgreSQL")
    try:
        repository = PostgresRepository(url)
    except psycopg.Error:
        pytest.skip("configured PostgreSQL is not reachable")
    if not repository.connection.execute("SELECT to_regclass('backfill_jobs') AS relation").fetchone()["relation"]:
        repository.close()
        pytest.skip("production-beta migration has not been applied")
    return repository


def test_batch_upsert_and_checkpoint_are_idempotent_and_recompute_award_total():
    repository = repository_or_skip()
    suffix = uuid.uuid4().hex[:12]
    transaction_id = f"INTEGRATION-TX-{suffix}"
    award_key = f"INTEGRATION-AWARD-{suffix}"
    uei = f"IT{suffix}"[:12].upper()
    raw = {
        "transaction_id": transaction_id, "internal_id": f"award-{suffix}", "generated_internal_id": award_key, "Award ID": f"PIID-{suffix}",
        "Recipient Name": f"Integration Company {suffix}", "Recipient UEI": uei,
        "Recipient Location": {"state_code": "MD", "county_fips": "24031"},
        "Primary Place of Performance": {"state_code": "VA", "county_fips": "51059"},
        "Action Date": "2025-01-02", "Transaction Amount": "125.50", "Transaction Description": "software support",
        "NAICS": "541512",
    }
    job = None
    try:
        normalized = normalize_transaction(raw, datetime.now(timezone.utc), IndustryClassifier())
        job = repository.create_or_resume_backfill_job(
            start_date=date(2025, 1, 1), end_date=date(2025, 1, 31), source_url=f"file:///integration-{suffix}.csv",
            source_file_name=f"integration-{suffix}.csv", batch_size=100,
        )
        first = repository.ingest_batch(
            [normalized], backfill_job_id=str(job["id"]),
            checkpoint={"member": "contracts.csv", "member_row": 1, "rows_processed": 1},
        )
        second = repository.ingest_batch(
            [normalized], backfill_job_id=str(job["id"]),
            checkpoint={"member": "contracts.csv", "member_row": 1, "rows_processed": 1},
        )
        corrected = normalize_transaction({**raw, "Transaction Amount": "130.00"}, datetime.now(timezone.utc), IndustryClassifier())
        third = repository.ingest_batch(
            [corrected], backfill_job_id=str(job["id"]),
            checkpoint={"member": "contracts.csv", "member_row": 1, "rows_processed": 1},
        )
        row = repository.connection.execute(
            """SELECT count(DISTINCT t.id) AS transactions,max(a.total_obligated) AS total,max(j.member_row) AS member_row,
               count(DISTINCT v.id) AS raw_versions
               FROM transactions t JOIN awards a ON a.id=t.award_id CROSS JOIN backfill_jobs j
               JOIN raw_source_transaction_versions v ON v.source_transaction_id=t.source_transaction_id
               WHERE t.source_transaction_id=%s AND j.id=%s GROUP BY j.id""",
            (transaction_id, job["id"]),
        ).fetchone()
        assert first["transactions_created"] == 1 and second["transactions_created"] == 0
        assert row["transactions"] == 1
        assert third["transactions_created"] == 0
        assert str(row["total"]) == "130.00"
        assert row["member_row"] == 1
        assert row["raw_versions"] == 2
    finally:
        repository.connection.execute("DELETE FROM raw_source_transaction_versions WHERE source_transaction_id=%s", (transaction_id,))
        repository.connection.execute("DELETE FROM raw_source_transactions WHERE source_transaction_id=%s", (transaction_id,))
        repository.connection.execute("DELETE FROM transactions WHERE source_transaction_id=%s", (transaction_id,))
        repository.connection.execute("DELETE FROM awards WHERE generated_award_id=%s", (award_key,))
        repository.connection.execute("DELETE FROM procurement_processes WHERE source_system='usaspending' AND source_process_id=%s", (award_key,))
        repository.connection.execute("DELETE FROM companies WHERE upper(uei)=upper(%s)", (uei,))
        if job:
            repository.connection.execute("DELETE FROM backfill_jobs WHERE id=%s", (job["id"],))
        repository.connection.commit()
        repository.close()
