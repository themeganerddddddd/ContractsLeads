from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

from movements.business_change import (
    CATEGORY_EVENT_TYPES,
    MODEL_VERSION,
    build_business_change_assessment,
    calculate_lead_time,
    deduplicate_signals,
)
from movements.dc import DcBasicBusinessLicenseAdapter, SAFE_FIELDS, is_public_operating_premise
from movements.models import stable_hash


AS_OF = date(2026, 10, 27)
OBSERVED = datetime(2026, 10, 27, tzinfo=timezone.utc)


def signal(
    signal_type: str,
    source_system: str,
    *,
    precision: str = "exact_address",
    observed_at: datetime = OBSERVED,
    source_event_id: str | None = None,
    evidence_group_id: str | None = None,
    origin: dict | None = None,
    destination: dict | None = None,
):
    return {
        "signal_fingerprint": stable_hash(signal_type, source_system, source_event_id or "record"),
        "signal_type": signal_type,
        "source_system": source_system,
        "source_event_id": source_event_id or f"{source_system}-{signal_type}",
        "evidence_group_id": evidence_group_id,
        "source_url": f"https://example.gov/{source_system}/{signal_type}",
        "observed_at": observed_at,
        "location_precision": precision,
        "strength": 1,
        "reliability": 1,
        "confidence": 1,
        "origin": origin,
        "destination": destination,
    }


def assess(assessment_type: str, signals: list[dict], **kwargs):
    return build_business_change_assessment(
        unit_type="establishment",
        establishment_id="establishment-1",
        assessment_type=assessment_type,
        signals=signals,
        as_of_date=AS_OF,
        **kwargs,
    )


def test_company_can_have_multiple_establishment_fingerprints():
    company_id = "company-1"
    first = stable_hash("establishment", company_id, "100 MAIN ST", "ROCKVILLE", "MD")
    second = stable_hash("establishment", company_id, "200 MARKET ST", "FREDERICK", "MD")
    assert first != second


def test_new_business_and_establishment_opening_are_distinct_categories():
    assert "business_formed" in CATEGORY_EVENT_TYPES["new-businesses"]
    assert "business_formed" not in CATEGORY_EVENT_TYPES["opening"]
    assert "location_opened" in CATEGORY_EVENT_TYPES["opening"]


def test_opening_requires_independent_evidence_for_strong_band():
    result = assess("opening", [
        signal("opening_announcement", "county_economic_development"),
        signal("certificate_of_occupancy", "county_occupancy"),
    ])
    assert result["band"] == "strong"
    assert result["components"]["independent_evidence"] is True
    assert result["model_version"] == MODEL_VERSION


def test_growth_contraction_and_closing_use_separate_rules():
    growth = assess("growth", [
        signal("expansion_announcement", "state_commerce"),
        signal("workforce_expansion", "state_workforce"),
        signal("capital_investment", "sec"),
    ])
    contraction = assess("contraction", [
        signal("warn_layoff", "state_warn"),
        signal("location_contraction", "county_permits"),
        signal("restructuring", "sec"),
    ])
    closing = assess("closing", [
        signal("closure_announcement", "company_release"),
        signal("license_termination", "city_licenses"),
    ])
    assert growth["band"] == "strong"
    assert contraction["band"] == "strong"
    assert closing["band"] == "strong"
    assert {growth["assessment_type"], contraction["assessment_type"], closing["assessment_type"]} == {
        "growth", "contraction", "closing",
    }


def test_relocation_claims_destination_only_with_origin_and_destination():
    incomplete = assess("relocation", [signal("registered_address_change", "registration")])
    complete = assess("relocation", [
        signal(
            "relocation_announcement",
            "state_commerce",
            origin={"state_code": "MD", "city": "Rockville"},
            destination={"state_code": "VA", "city": "Arlington"},
        ),
        signal("destination_permit", "arlington_permits"),
    ])
    assert incomplete["components"]["destination_claim_supported"] is False
    assert incomplete["components"]["destination"] is None
    assert complete["components"]["destination_claim_supported"] is True
    assert complete["components"]["origin"]["city"] == "Rockville"
    assert complete["components"]["destination"]["city"] == "Arlington"


def test_new_facility_is_not_automatically_a_relocation():
    result = assess("relocation", [signal("new_construction_permit", "county_permits")])
    assert result["score"] is None
    assert result["band"] == "insufficient_evidence"


def test_warn_does_not_become_total_company_closure():
    result = assess("closing", [signal("warn_layoff", "maryland_warn")])
    assert result["band"] == "early"
    assert result["score"] < 40
    assert "outcome" not in result


def test_contract_does_not_prove_physical_opening_or_expansion():
    opening = assess("opening", [signal("new_government_award", "usaspending")])
    growth = assess("growth", [signal("new_government_award", "usaspending")])
    assert opening["score"] is None
    assert growth["band"] == "early"
    assert growth["score"] < 40


def test_permit_does_not_prove_occupancy():
    result = assess("opening", [signal("new_construction_permit", "county_permits")])
    assert result["band"] == "early"
    assert result["score"] < 40


def test_business_registration_does_not_prove_establishment_opening():
    result = assess("opening", [signal("business_formed", "state_registration")])
    assert result["score"] is None
    assert result["data_sufficiency"] == "insufficient_history"


def test_source_deduplication_and_evidence_grouping_count_one_fact_once():
    duplicates = [
        signal("new_business_license", "dc_licenses", source_event_id="license-1"),
        {**signal("new_business_license", "dc_licenses", source_event_id="license-1"), "confidence": 0.4},
        signal("certificate_of_occupancy", "dc_occupancy", evidence_group_id="opening-1"),
        signal("certificate_of_occupancy", "dc_occupancy_copy", evidence_group_id="opening-1"),
    ]
    deduplicated = deduplicate_signals(duplicates)
    result = assess("opening", duplicates)
    assert len(deduplicated) == 2
    assert len(result["components"]["items"]) == 2


def test_point_in_time_cutoff_excludes_future_observation():
    future = datetime(2026, 10, 28, tzinfo=timezone.utc)
    result = assess("opening", [signal("opening_announcement", "state_commerce", observed_at=future)])
    assert result["score"] is None
    assert result["components"]["items"] == []


def test_lead_time_never_uses_a_post_outcome_indication():
    assert calculate_lead_time(datetime(2026, 3, 1, tzinfo=timezone.utc), date(2026, 5, 15)) == 75
    assert calculate_lead_time(datetime(2026, 6, 1, tzinfo=timezone.utc), date(2026, 5, 15)) is None
    assert calculate_lead_time(None, date(2026, 5, 15)) is None


def test_county_geography_scores_below_exact_address_and_creates_no_address():
    exact = assess("opening", [signal("opening_announcement", "commerce", precision="exact_address")])
    county = assess("opening", [signal("opening_announcement", "commerce", precision="county")])
    assert county["score"] < exact["score"]
    assert county["components"]["items"][0]["location_precision"] == "county"
    assert "address" not in county


def dc_license(**overrides):
    base = {
        "CUSTOMERNUMBER": "500000000001",
        "LICENSESTATUS": "Active",
        "LICENSETYPE": "Basic Business License",
        "LICENSESTATUSDATE": 1791172800000,
        "LICENSESTARTDATE": 1791172800000,
        "LICENSEENDDATE": 1822708800000,
        "INITIALISSUEDATE": 1791172800000,
        "BUSINESSACTIVITY": "Restaurant",
        "PREMISEADDRESS": "1200 K St NW, Suite 100, Washington, DC, 20005, USA",
        "PREMISEINDC": "Yes",
        "ENTITYNAME": "Example Dining LLC",
        "ENTITYTRADENAME": "Example Cafe",
        "ENTITYTYPE": "Limited Liability Company",
        "PRIMARYACTIVITYFLAG": "Yes",
        "CATEGORYSERVICETYPE": "Food Services",
        "DATAREFRESHEDON": 1793073600000,
        "WARD": "Ward 2",
        "ANC": "2C",
        "SMD": "2C01",
        "DISTRICT": "SECOND",
        "PSA": "101",
        "NEIGHBORHOODCLUSTER": "Cluster 8",
        "BUSINESSIMPROVEMENTDISTRICT": "DowntownDC",
        "MAINSTREET": None,
        "MAR_ID": 12345,
        "LATITUDE": 38.9031,
        "LONGITUDE": -77.0284,
        "GLOBALID": "{SAFE-GLOBAL-ID}",
        "OBJECTID": 42,
        "BUSINESSOWNERFIRSTNAME": "Must not persist",
        "BILLINGADDRESS": "Must not persist",
        "AGENTENTITY": "Must not persist",
    }
    return {**base, **overrides}


def test_dc_license_builds_unresolved_establishment_signal_without_private_fields():
    record = DcBasicBusinessLicenseAdapter().normalize(dc_license(), observed_at=OBSERVED)
    assert record["premise_is_public_business_location"] is True
    assert "company_id" not in record["establishment"]
    assert record["resolution_status"] == "unresolved"
    assert record["signal"]["signal_type"] == "new_business_license"
    assert record["signal"]["evidence"]["license_is_not_opening_proof"] is True
    assert record["premise_address"] == "1200 K St NW, Suite 100"
    assert record["latitude"] == record["establishment"]["latitude"]
    assert all(field in SAFE_FIELDS for field in record["raw_payload"])
    assert not any("OWNER" in field or "AGENT" in field or "BILLING" in field for field in record["raw_payload"])


def test_dc_residential_license_does_not_expose_premise_or_create_establishment():
    source = dc_license(
        BUSINESSACTIVITY="One Family Rental",
        CATEGORYSERVICETYPE="Housing and Lodging Services",
        ENTITYTYPE="Sole Proprietorship",
    )
    assert is_public_operating_premise(source) is False
    record = DcBasicBusinessLicenseAdapter().normalize(source, observed_at=OBSERVED)
    assert record["premise_address"] is None
    assert record["latitude"] is None
    assert record["longitude"] is None
    assert record["establishment"] is None
    assert record["signal"] is None


def test_dc_coarse_coordinates_do_not_create_fake_precise_pin():
    record = DcBasicBusinessLicenseAdapter().normalize(dc_license(LATITUDE=39, LONGITUDE=-77), observed_at=OBSERVED)
    assert record["latitude"] is None
    assert record["longitude"] is None


def test_location_schema_is_additive_and_preserves_privacy_history_and_indexes():
    migration = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "0015_location_business_change.sql").read_text(encoding="utf-8")
    required = {
        "business_establishments", "establishment_address_history", "business_licenses", "business_license_versions",
        "establishment_events", "establishment_event_evidence", "business_change_evidence_groups",
        "business_change_signals", "business_change_outcomes", "business_change_assessments",
        "location_monitor_targets", "business_change_source_coverage",
    }
    assert all(f"CREATE TABLE IF NOT EXISTS {table}" in migration for table in required)
    assert "CHECK (is_public_business_location OR address_line IS NULL)" in migration
    assert "CHECK (premise_is_public_business_location OR premise_address IS NULL)" in migration
    assert "establishment_address_history_establishment_idx" in migration
    assert "UNIQUE (business_license_id,content_hash)" in migration
    assert "business_change_signals_geography_idx" in migration
    assert "business_change_outcomes_geography_idx" in migration
    assert "business-change-probability-unavailable-v1" in migration
    assert "'establishment_opening'" in migration
    assert "'establishment_closure'" in migration
    assert "DROP TABLE" not in migration.upper()
    assert "TRUNCATE TABLE" not in migration.upper()
    assert "DELETE FROM" not in migration.upper()


def test_schema_entry_point_includes_location_business_change_migration():
    schema = (Path(__file__).resolve().parents[1] / "db" / "schema.sql").read_text(encoding="utf-8")
    assert "0015_location_business_change.sql" in schema
