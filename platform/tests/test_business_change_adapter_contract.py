from datetime import datetime, timezone

from ingestion.adapters import BusinessChangeObservation


def test_business_change_observation_keeps_source_and_geography_explicit():
    observation = BusinessChangeObservation(
        source_system="state_warn",
        source_record_id="notice-1",
        source_url="https://example.gov/warn/notice-1",
        observed_at=datetime(2026, 10, 28, tzinfo=timezone.utc),
        observed_business_name="Example Manufacturing",
        official_identifiers=(),
        address_line=None,
        city="Richmond",
        county=None,
        county_fips=None,
        state_code="VA",
        postal_code=None,
        country_code="US",
        observation_type="workforce_reduction",
        evidence_family="warn",
        event_date=None,
        raw_archive_pointer="raw/virginia/warn/2026/10/notice-1.json.gz",
        content_hash="abc123",
        metadata={"headquarters_verified": False},
    )

    assert observation.state_code == "VA"
    assert observation.raw_archive_pointer.startswith("raw/virginia/warn/")
    assert observation.metadata["headquarters_verified"] is False
