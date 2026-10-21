from datetime import datetime, timezone

from ingestion.events import derive_usaspending_events


def fixture(obligation="250"):
    return {
        "company": {"legal_name": "Example"},
        "award": {"generated_award_id": "AWARD-1", "piid": "PIID-1", "title": "Example award", "source_url": "https://www.usaspending.gov/award/AWARD-1"},
        "transaction": {
            "source_transaction_id": "TX-1", "action_date": datetime(2026, 1, 1, tzinfo=timezone.utc).date(),
            "action_type": "Funding Only Action", "modification_number": "P00002", "obligation": obligation,
            "description": "Exercise option year",
        },
    }


def test_usaspending_modification_derives_stable_explainable_events():
    first = derive_usaspending_events(fixture(), award_inserted=False)
    second = derive_usaspending_events(fixture(), award_inserted=False)
    assert {event["event_type"] for event in first} == {"contract_modified", "value_increased", "option_exercised"}
    assert [event["event_fingerprint"] for event in first] == [event["event_fingerprint"] for event in second]
    assert all(event["evidence"]["transaction_id"] == "TX-1" for event in first)


def test_negative_obligation_is_a_value_decrease():
    assert "value_decreased" in {event["event_type"] for event in derive_usaspending_events(fixture("-10"), award_inserted=False)}
