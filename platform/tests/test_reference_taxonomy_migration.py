from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "db"
    / "migrations"
    / "0007_reference_industry_taxonomy.sql"
).read_text(encoding="utf-8")


def test_reference_taxonomy_is_production_safe_and_backfills_exact_codes():
    lowered = MIGRATION.lower()
    assert "insert into industries" in lowered
    assert "insert into naics_industry_map" in lowered
    assert "insert into psc_industry_map" in lowered
    assert "insert into cpv_industry_map" in lowered
    assert "update awards" in lowered
    assert "update procurement_processes" in lowered
    assert "insert into companies" not in lowered
    assert "insert into transactions" not in lowered
    assert "demo_" not in lowered
