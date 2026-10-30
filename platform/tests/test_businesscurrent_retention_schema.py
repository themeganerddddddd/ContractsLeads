from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_retention_migration_is_additive_and_auditable():
    sql = (ROOT / "db" / "migrations" / "0016_businesscurrent_retention.sql").read_text(encoding="utf-8")

    for table in (
        "raw_source_archives",
        "raw_source_archive_items",
        "source_retention_policies",
        "company_monthly_features",
        "establishment_monthly_features",
        "geography_industry_monthly_features",
        "feature_exports",
        "national_source_coverage",
        "saved_market_views",
    ):
        assert f"CREATE TABLE IF NOT EXISTS {table}" in sql
    assert "hot_days" in sql
    assert "archive_years" in sql
    assert "verification_status" in sql
    assert "all 50" not in sql.lower()
    assert "DELETE FROM" not in sql.upper()
    assert "DROP TABLE" not in sql.upper()


def test_archive_package_never_implements_implicit_pruning():
    retention = (ROOT / "archive" / "retention.py").read_text(encoding="utf-8")

    assert "This class never deletes" in retention
    assert "DELETE FROM" not in retention.upper()
    assert "UPDATE " not in retention.upper()
