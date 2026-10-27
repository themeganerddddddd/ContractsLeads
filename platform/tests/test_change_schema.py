from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = (ROOT / "db" / "migrations" / "0014_company_change_intelligence.sql").read_text(encoding="utf-8")


def test_outcome_registration_and_formation_units_are_explicit():
    assert "CREATE TABLE IF NOT EXISTS company_outcomes" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS business_registrations" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS formation_activity_snapshots" in MIGRATION
    assert "company_id uuid REFERENCES companies(id) ON DELETE SET NULL" in MIGRATION
    assert "model_type='business_formation' AND company_id IS NULL" in MIGRATION


def test_prediction_probability_is_null_when_validation_is_insufficient():
    assert "CREATE TABLE IF NOT EXISTS company_change_predictions" in MIGRATION
    assert "data_sufficiency<>'sufficient' AND probability IS NULL" in MIGRATION
    assert "'company_expansion','company_relocation','company_growth','company_contraction','business_formation'" in MIGRATION


def test_signal_interfaces_and_coverage_states_are_explicit():
    assert "CREATE TABLE IF NOT EXISTS hiring_signal_observations" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS company_property_signals" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS company_funding_signals" in MIGRATION
    assert "'implemented','available','unsupported','licensing_blocked','insufficient_coverage'" in MIGRATION


def test_change_migration_does_not_delete_or_rewrite_historical_facts():
    assert not re.search(r"\b(?:DROP|TRUNCATE)\s+TABLE\b", MIGRATION, re.IGNORECASE)
    assert not re.search(r"\bDELETE\s+FROM\b", MIGRATION, re.IGNORECASE)
    assert not re.search(r"\bUPDATE\s+(?:companies|awards|transactions|procurement_events|company_events|movement_assessments)\b", MIGRATION, re.IGNORECASE)


def test_schema_entry_point_includes_change_intelligence_migration():
    schema = (ROOT / "db" / "schema.sql").read_text(encoding="utf-8")
    assert "0014_company_change_intelligence.sql" in schema
