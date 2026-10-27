from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from movements.formation import build_formation_snapshot
from movements.outcomes import registration_outcome
from movements.registrations import adapter_status


def test_formation_snapshot_is_geography_industry_activity_not_probability():
    snapshot = build_formation_snapshot(
        as_of_month=date(2026, 10, 1), country_code="US", state_code="MD", county_fips="24031",
        industry_code="BIO", industry_label="Biotechnology",
        observations={
            "new_registrations": 27, "previous_year_registrations": 15,
            "rolling_average_registrations": 18, "commercial_permit_growth": 0.4,
            "coverage": {"registrations": "official"},
        },
    )
    assert snapshot["formation_score"] is not None
    assert snapshot["activity_level"] in {"low", "moderate", "high"}
    assert snapshot["components"]["score_kind"] == "formation_activity_not_probability"
    assert "company_id" not in snapshot


def test_missing_registration_feed_hides_formation_score():
    snapshot = build_formation_snapshot(
        as_of_month=date(2026, 10, 1), country_code="US", industry_code="BIO",
        observations={"commercial_permits": 12, "coverage": {"registrations": "unsupported"}},
    )
    assert snapshot["formation_score"] is None
    assert snapshot["data_sufficiency"] == "insufficient_history"


def test_official_registration_is_preserved_before_company_resolution():
    registration = {
        "id": "registration-1", "source_system": "official_registry", "official_identifier": "MD-123",
        "legal_name": "NewCo LLC", "formation_date": date(2026, 9, 1), "country_code": "US",
        "state_code": "MD", "county_fips": "24031", "city": "Rockville",
        "source_url": "https://official.example/MD-123", "company_id": None, "resolution_status": "unresolved",
        "first_observed_at": datetime(2026, 9, 2, tzinfo=timezone.utc),
    }
    outcome = registration_outcome(registration)
    assert outcome and outcome["outcome_type"] == "formation"
    assert outcome["company_id"] is None
    assert outcome["evidence"]["official_identifier"] == "MD-123"


def test_no_configured_registration_adapter_is_explicitly_unsupported():
    assert adapter_status([])["status"] == "unsupported"


def test_formation_month_must_be_normalized():
    with pytest.raises(ValueError):
        build_formation_snapshot(
            as_of_month=date(2026, 10, 2), country_code="US", industry_code="BIO", observations={},
        )
