from pathlib import Path


MIGRATION = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "0005_global_procurement_intelligence.sql").read_text(encoding="utf-8")
US_BACKFILL = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "0006_us_lifecycle_backfill.sql").read_text(encoding="utf-8")


def test_global_schema_separates_organizations_legal_entities_and_identifiers():
    assert "CREATE TABLE IF NOT EXISTS organizations" in MIGRATION
    assert "ADD COLUMN IF NOT EXISTS organization_id" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS organization_company_mappings" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS entity_identifiers" in MIGRATION
    assert "mapping_status" in MIGRATION and "reviewed_by" in MIGRATION


def test_global_processes_preserve_native_value_and_require_complete_fx_evidence():
    assert "CREATE TABLE IF NOT EXISTS procurement_processes" in MIGRATION
    assert "value_native numeric" in MIGRATION
    assert "value_usd numeric" in MIGRATION
    assert "fx_source_url" in MIGRATION
    assert "value_usd IS NULL AND fx_rate IS NULL" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS procurement_process_suppliers" in MIGRATION


def test_events_and_predictions_are_append_only_and_fingerprinted():
    assert "event_fingerprint text NOT NULL UNIQUE" in MIGRATION
    assert "prediction_fingerprint text NOT NULL UNIQUE" in MIGRATION
    assert "model_type,version" in MIGRATION
    assert "company_momentum" in MIGRATION


def test_existing_us_transactions_are_backfilled_into_processes_and_events():
    assert "INSERT INTO procurement_processes" in US_BACKFILL
    assert "UPDATE awards a SET procurement_process_id" in US_BACKFILL
    assert "row_number() OVER (PARTITION BY t.award_id" in US_BACKFILL
    assert "ON CONFLICT (event_fingerprint) DO NOTHING" in US_BACKFILL
