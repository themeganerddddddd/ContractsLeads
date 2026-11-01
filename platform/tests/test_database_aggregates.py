from __future__ import annotations

import os
import uuid
from decimal import Decimal

import psycopg
import pytest
from psycopg.rows import dict_row


def database_connection():
    url = os.getenv("PLATFORM_DATABASE_DIRECT_URL") or os.getenv("DATABASE_DIRECT_URL") or os.getenv("DATABASE_URL")
    if not url:
        pytest.skip("database integration test requires PLATFORM_DATABASE_DIRECT_URL or DATABASE_URL")
    try:
        connection = psycopg.connect(url, row_factory=dict_row, connect_timeout=2)
    except psycopg.Error:
        pytest.skip("configured PostgreSQL is not reachable")
    if not connection.execute("SELECT to_regclass('annual_company_activity') AS relation").fetchone()["relation"]:
        connection.close()
        pytest.skip("production-beta migration has not been applied")
    return connection


def test_transaction_aggregates_are_not_changed_by_page_size_and_keep_geographies_separate():
    connection = database_connection()
    suffix = uuid.uuid4().hex[:10]
    try:
        company = connection.execute(
            """INSERT INTO companies (legal_name,canonical_name,slug,recipient_state,recipient_state_fips,
               recipient_county_fips,first_seen,last_seen) VALUES (%s,%s,%s,'MD','24','24031',current_date,current_date)
               RETURNING id""",
            (f"Aggregate Test {suffix}", f"Aggregate Test {suffix}", f"aggregate-test-{suffix}"),
        ).fetchone()["id"]
        award_a = connection.execute(
            """INSERT INTO awards (generated_award_id,recipient_company_id,award_date,performance_state,
               performance_state_fips,performance_county_fips) VALUES (%s,%s,'2025-01-01','VA','51','51059') RETURNING id""",
            (f"AGG-A-{suffix}", company),
        ).fetchone()["id"]
        award_b = connection.execute(
            """INSERT INTO awards (generated_award_id,recipient_company_id,award_date,performance_state,
               performance_state_fips,performance_county_fips) VALUES (%s,%s,'2025-02-01','MD','24','24031') RETURNING id""",
            (f"AGG-B-{suffix}", company),
        ).fetchone()["id"]
        connection.cursor().executemany(
            "INSERT INTO transactions (source_transaction_id,award_id,action_date,obligation) VALUES (%s,%s,%s,%s)",
            [
                (f"AGG-T1-{suffix}", award_a, "2024-12-31", Decimal("10")),
                (f"AGG-T2-{suffix}", award_a, "2025-01-02", Decimal("20")),
                (f"AGG-T3-{suffix}", award_b, "2025-02-02", Decimal("30")),
            ],
        )
        complete = connection.execute(
            """SELECT count(DISTINCT a.id) AS awards,count(t.id) AS transactions,sum(t.obligation) AS obligations
               FROM awards a JOIN transactions t ON t.award_id=a.id WHERE a.recipient_company_id=%s""", (company,)
        ).fetchone()
        first_page = connection.execute(
            "SELECT id FROM awards WHERE recipient_company_id=%s ORDER BY award_date LIMIT 1", (company,)
        ).fetchall()
        annual = connection.execute(
            """SELECT calendar_year,award_count,transaction_count,disclosed_obligations
               FROM annual_company_activity WHERE company_id=%s ORDER BY calendar_year""", (company,)
        ).fetchall()
        geography = connection.execute(
            """SELECT
               count(DISTINCT a.id) FILTER (WHERE c.recipient_county_fips='24031') AS recipient_awards,
               count(DISTINCT a.id) FILTER (WHERE a.performance_county_fips='24031') AS performance_awards
               FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE c.id=%s""", (company,)
        ).fetchone()

        assert len(first_page) == 1
        assert complete == {"awards": 2, "transactions": 3, "obligations": Decimal("60")}
        assert [(row["calendar_year"], row["award_count"], row["transaction_count"], row["disclosed_obligations"]) for row in annual] == [
            (2024, 1, 1, Decimal("10")), (2025, 2, 2, Decimal("50"))
        ]
        assert geography == {"recipient_awards": 2, "performance_awards": 1}
    finally:
        connection.rollback()
        connection.close()


def test_annual_company_activity_keeps_signed_deobligations_in_net_reporting():
    connection = database_connection()
    suffix = uuid.uuid4().hex[:10]
    try:
        company = connection.execute(
            """INSERT INTO companies (legal_name,canonical_name,slug,first_seen,last_seen)
               VALUES (%s,%s,%s,current_date,current_date) RETURNING id""",
            (f"Net Accounting Test {suffix}", f"Net Accounting Test {suffix}", f"net-accounting-test-{suffix}"),
        ).fetchone()["id"]
        award = connection.execute(
            """INSERT INTO awards (generated_award_id,recipient_company_id,award_date)
               VALUES (%s,%s,'2026-01-01') RETURNING id""",
            (f"NET-{suffix}", company),
        ).fetchone()["id"]
        connection.cursor().executemany(
            "INSERT INTO transactions (source_transaction_id,award_id,action_date,obligation) VALUES (%s,%s,%s,%s)",
            [
                (f"NET-T1-{suffix}", award, "2026-01-01", Decimal("10000000")),
                (f"NET-T2-{suffix}", award, "2026-06-01", Decimal("-2000000")),
            ],
        )
        annual = connection.execute(
            """SELECT transaction_count,disclosed_obligations FROM annual_company_activity
               WHERE company_id=%s AND calendar_year=2026""",
            (company,),
        ).fetchone()
        assert annual == {"transaction_count": 2, "disclosed_obligations": Decimal("8000000")}
    finally:
        connection.rollback()
        connection.close()
