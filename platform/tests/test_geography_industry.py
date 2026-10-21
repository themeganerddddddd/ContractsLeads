from ingestion.geography import normalize_geography
from ingestion.industry import IndustryClassifier
from ingestion.normalize import normalize_transaction
from datetime import datetime, timezone


def test_state_and_county_fips_are_normalized():
    location = normalize_geography({"city_name": "Rockville", "state_code": "MD", "county_code": "031", "zip5": "20850"})
    assert location.state == "MD"
    assert location.state_fips == "24"
    assert location.county_fips == "24031"


def test_recipient_and_performance_geography_remain_separate():
    record = normalize_transaction({
        "internal_id": "tx-1", "generated_internal_id": "award-1", "Recipient Name": "Example",
        "Recipient Location": {"city_name": "Reston", "state_code": "VA", "county_code": "059"},
        "Primary Place of Performance": {"city_name": "Rockville", "state_code": "MD", "county_code": "031"},
        "Action Date": "2026-10-01", "Transaction Amount": 100,
    }, datetime(2026, 10, 2, tzinfo=timezone.utc))
    assert record["company"]["recipient"]["county_fips"] == "51059"
    assert record["award"]["performance"]["county_fips"] == "24031"
    assert record["company"]["recipient"]["city"] == "Reston"
    assert record["award"]["performance"]["city"] == "Rockville"


def test_explicit_naics_and_psc_mapping_precede_keywords():
    classifier = IndustryClassifier()
    assert classifier.classify({"NAICS": "336414", "Transaction Description": "general support"}).primary_slug == "space-satellite"
    assert classifier.classify({"PSC": "D310", "Transaction Description": "general support"}).primary_slug == "cybersecurity"
    keyword = classifier.classify({"Transaction Description": "machine learning and data analytics platform"})
    assert keyword.primary_slug == "artificial-intelligence-data"
    assert keyword.confidence < 0.98
