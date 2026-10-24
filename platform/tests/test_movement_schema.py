from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "db"
    / "migrations"
    / "0012_company_movement_intelligence.sql"
).read_text(encoding="utf-8")


def test_movement_events_are_separate_from_procurement_events_and_source_backed():
    assert "CREATE TABLE IF NOT EXISTS company_events" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS company_event_sources" in MIGRATION
    assert "source_record_fingerprint text NOT NULL UNIQUE" in MIGRATION
    assert "content_hash text NOT NULL" in MIGRATION
    assert "REFERENCES procurement_events" not in MIGRATION


def test_unmatched_evidence_and_ambiguous_company_matches_are_preserved():
    assert "event_id uuid REFERENCES company_events(id) ON DELETE SET NULL" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS company_match_reviews" in MIGRATION
    assert "'unmatched','ambiguous','pending','approved','rejected'" in MIGRATION
    assert "matching_evidence jsonb" in MIGRATION


def test_company_locations_do_not_reuse_procurement_recipient_addresses():
    assert "CREATE TABLE IF NOT EXISTS company_locations" in MIGRATION
    assert "'verified_headquarters','facility','office','registered_office','branch','other'" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS company_event_locations" in MIGRATION
    assert "recipient_address" not in MIGRATION
    assert "operational_status" in MIGRATION
    assert "opening_date date" in MIGRATION
    assert "closure_date date" in MIGRATION


def test_event_and_company_relationship_roles_cover_multi_party_and_multi_location_cases():
    assert "'owner','tenant','occupant','developer','permit_applicant','contractor','investor'" in MIGRATION
    assert "'affected_worksite','origin','destination','new_facility','expanded_facility'" in MIGRATION
    assert "event_id uuid NOT NULL REFERENCES company_events(id) ON DELETE CASCADE" in MIGRATION


def test_coverage_and_explainable_assessment_contracts_are_explicit():
    assert "CREATE TABLE IF NOT EXISTS geographic_source_coverage" in MIGRATION
    assert "known_limitations text NOT NULL" in MIGRATION
    assert "CREATE TABLE IF NOT EXISTS movement_assessments" in MIGRATION
    assert "evidence_event_ids uuid[]" in MIGRATION
    assert "data_sufficiency" in MIGRATION


def test_psql_schema_entry_point_includes_all_migrations():
    schema = (Path(__file__).resolve().parents[1] / "db" / "schema.sql").read_text(encoding="utf-8")
    assert "0012_company_movement_intelligence.sql" in schema
    assert "0011_repair_us_event_dates.sql" in schema
