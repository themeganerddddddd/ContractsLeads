from datetime import datetime, timezone

from movements.permits import MontgomeryCountyPermitAdapter, classify_commercial_permit


def test_commercial_permit_classifier_prioritizes_large_meaningful_projects():
    permit = {
        "worktype": "ALTER",
        "usecode": "BUSINESS BUILDING",
        "description": "Renovation of an existing automotive dealership and associated offices",
        "declaredvaluation": "5500000",
        "buildingarea": "48983",
    }
    result = classify_commercial_permit(permit)
    assert result.relevant is True
    assert result.classification == "high_value_commercial"
    assert result.score >= 0.50
    assert any("$1 million" in reason for reason in result.reasons)


def test_low_value_fence_permit_does_not_become_an_expansion_indicator():
    result = classify_commercial_permit({
        "worktype": "CONSTRUCT",
        "usecode": "COMMERCIAL MISCELLANEOUS STRUC",
        "description": "Install 336 linear feet of vinyl fence",
        "declaredvaluation": "0",
        "buildingarea": "0",
    })
    assert result.relevant is False
    assert result.classification == "not_relevant"


def test_permit_normalization_preserves_geography_and_unknown_parties():
    movement = MontgomeryCountyPermitAdapter().normalize(
        {
            "permitno": "1169424",
            "status": "Open",
            "stno": "11617",
            "stname": "OLD GEORGETOWN",
            "suffix": "RD",
            "city": "ROCKVILLE",
            "state": "MD",
            "zip": "20852",
            "addeddate": "2026-08-25T02:08:30.000",
            "buildingarea": "48983",
            "declaredvaluation": "5500000",
            "description": "Renovation of an existing automotive dealership and associated offices",
            "applicationtype": "COMMERCIAL BUILDING",
            "worktype": "ALTER",
            "usecode": "BUSINESS BUILDING",
            "location": {"latitude": "39.04931", "longitude": "-77.11544"},
        },
        observed_at=datetime(2026, 10, 23, tzinfo=timezone.utc),
    )
    assert movement["permit_number"] == "1169424"
    assert movement["address_line"] == "11617 OLD GEORGETOWN RD"
    assert movement["county_fips"] == "24031"
    assert movement["project_value"] == 5_500_000
    assert movement["applicant"] is None
    assert movement["contractor"] is None
    assert movement["developer"] is None
    assert movement["property_owner"] is None
    assert movement["verified_occupant"] is None
    assert "permitno%3D%271169424%27" in movement["source_url"]


def test_permit_schema_preserves_revisions_and_separates_company_roles():
    from pathlib import Path

    migration = (
        Path(__file__).resolve().parents[1]
        / "db"
        / "migrations"
        / "0012_company_movement_intelligence.sql"
    ).read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS development_permit_versions" in migration
    assert "UNIQUE (permit_id,content_hash)" in migration
    assert "CREATE TABLE IF NOT EXISTS permit_company_relationships" in migration
    assert "'owner','tenant','occupant','developer','permit_applicant','contractor','other'" in migration
