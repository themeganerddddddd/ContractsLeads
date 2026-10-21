from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = (ROOT / "db" / "migrations" / "0001_initial.sql").read_text(encoding="utf-8")
HARDENING = (ROOT / "db" / "migrations" / "0002_production_beta.sql").read_text(encoding="utf-8")
HISTORY = (ROOT / "db" / "migrations" / "0003_source_history.sql").read_text(encoding="utf-8")
QUERY_INDEXES = (ROOT / "db" / "migrations" / "0004_query_plan_indexes.sql").read_text(encoding="utf-8")


def test_awards_and_transactions_are_separate_and_source_ids_are_unique():
    assert "CREATE TABLE IF NOT EXISTS awards" in SCHEMA
    assert "CREATE TABLE IF NOT EXISTS transactions" in SCHEMA
    assert "source_transaction_id text NOT NULL UNIQUE" in SCHEMA
    assert "award_id uuid NOT NULL REFERENCES awards" in SCHEMA


def test_recipient_and_performance_indexes_are_separate():
    assert "companies_recipient_county_idx" in SCHEMA
    assert "awards_performance_county_idx" in SCHEMA
    assert "companies_recipient_state_idx" in SCHEMA
    assert "awards_performance_state_idx" in SCHEMA


def test_uei_is_unique_only_when_present():
    assert "companies_uei_unique" in SCHEMA
    assert "WHERE uei IS NOT NULL" in SCHEMA


def test_backfill_checkpoints_and_qa_observations_are_persisted():
    assert "CREATE TABLE IF NOT EXISTS backfill_jobs" in HARDENING
    assert "current_member text" in HARDENING
    assert "rows_processed bigint" in HARDENING
    assert "CREATE TABLE IF NOT EXISTS company_geography_observations" in HARDENING
    assert "CREATE TABLE IF NOT EXISTS award_identity_observations" in HARDENING


def test_annual_views_sum_transactions_not_repeated_award_totals():
    assert "CREATE OR REPLACE VIEW annual_company_activity" in HARDENING
    assert "sum(t.obligation)" in HARDENING
    assert "extract(year FROM t.action_date)" in HARDENING


def test_source_revisions_are_append_only_and_hash_deduplicated():
    assert "CREATE TABLE IF NOT EXISTS raw_source_transaction_versions" in HISTORY
    assert "UNIQUE (source, source_transaction_id, payload_hash)" in HISTORY
    assert "CREATE TABLE IF NOT EXISTS company_geography_observation_versions" in HISTORY
    assert "CREATE TABLE IF NOT EXISTS award_identity_observation_versions" in HISTORY


def test_contract_search_expression_has_an_exact_gin_index():
    assert "awards_title_description_search_idx" in QUERY_INDEXES
    assert "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))" in QUERY_INDEXES
