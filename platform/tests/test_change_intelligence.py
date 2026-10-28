from __future__ import annotations

from datetime import date, datetime, timezone

from movements.change_intelligence import MODEL_VERSION, build_change_assessment, material_indication_change
from movements.outcomes import event_outcome


AS_OF = date(2026, 10, 27)


def signal(identifier: str, source: str, kind: str, day: str, **extra):
    return {
        "id": identifier, "evidence_key": identifier, "source_system": source,
        "source_family": extra.pop("source_family", source), "indicator_type": kind,
        "observed_at": datetime.fromisoformat(day).replace(tzinfo=timezone.utc),
        "strength": 1.0, "reliability": 1.0, "confidence": 1.0,
        "source_url": f"https://official.example/{identifier}", **extra,
    }


def movement_event(event_type: str, locations=None):
    return {
        "event_id": "event-1", "company_id": "company-1", "event_type": event_type,
        "review_status": "approved", "verification_status": "source_verified",
        "effective_start_date": date(2026, 10, 1), "announced_date": date(2026, 9, 1),
        "source_system": "official_press", "source_url": "https://official.example/event-1",
        "source_country": "US", "first_observed_at": datetime(2026, 9, 1, tzinfo=timezone.utc),
        "locations": locations or [], "title": "Official company announcement",
    }


def test_confirmed_expansion_and_indication_remain_separate_products():
    outcome = event_outcome(movement_event("facility_expansion"))
    assessment = build_change_assessment(
        "company-1", [signal("press", "official_press", "facility_expansion", "2026-10-01T00:00:00")],
        as_of_date=AS_OF, assessment_type="expansion",
    )
    assert outcome and outcome["outcome_type"] == "expansion"
    assert assessment["model_version"] == MODEL_VERSION
    assert assessment["components"]["score_kind"] == "descriptive_indication_not_probability"
    assert "probability" in assessment["explanation"]


def test_contract_award_is_supporting_evidence_not_expansion_outcome():
    assert event_outcome({**movement_event("award_announced"), "event_type": "award_announced"}) is None
    assessment = build_change_assessment(
        "company-1", [signal("award", "usaspending", "award_announced", "2026-10-01T00:00:00", source_family="federal_procurement")],
        as_of_date=AS_OF, assessment_type="expansion",
    )
    assert assessment["score"] < 10
    assert assessment["data_sufficiency"] == "limited"


def test_new_facility_is_not_relocation_and_destination_claim_requires_both_places():
    new_facility = event_outcome(movement_event("new_facility"))
    assert new_facility and new_facility["outcome_type"] == "new_facility"
    assert event_outcome(movement_event("relocation", [{"location_role": "destination", "state_code": "MD"}])) is None
    relocation = event_outcome(movement_event("relocation", [
        {"location_role": "origin", "country_code": "US", "state_code": "VA", "city": "Arlington"},
        {"location_role": "destination", "country_code": "US", "state_code": "MD", "city": "Rockville"},
    ]))
    assert relocation and relocation["origin_state"] == "VA" and relocation["destination_state"] == "MD"
    indication = build_change_assessment(
        "company-1", [signal("facility", "official_press", "new_facility", "2026-10-01T00:00:00")],
        as_of_date=AS_OF, assessment_type="relocation",
    )
    assert indication["score"] is None
    supported = build_change_assessment(
        "company-1", [signal(
            "move", "official_press", "relocation", "2026-10-01T00:00:00",
            origin={"country_code": "US", "state_code": "VA"},
            destination={"country_code": "US", "state_code": "MD"},
        )], as_of_date=AS_OF, assessment_type="relocation",
    )
    assert supported["components"]["destination_claim_supported"] is True
    assert supported["components"]["destination"]["state_code"] == "MD"


def test_point_in_time_dedup_source_independence_and_decay():
    rows = [
        signal("same", "permit_source", "commercial_expansion", "2026-10-01T00:00:00", event_id="event-1"),
        signal("duplicate", "press_source", "facility_expansion", "2026-10-02T00:00:00", event_id="event-1", evidence_key="same"),
        signal("independent", "hiring_source", "hiring_acceleration", "2026-10-03T00:00:00"),
        signal("future", "future_source", "investment", "2026-10-28T00:00:00"),
    ]
    current = build_change_assessment("company-1", rows, as_of_date=AS_OF, assessment_type="expansion")
    later = build_change_assessment("company-1", rows[:1], as_of_date=date(2027, 10, 27), assessment_type="expansion")
    assert len(current["components"]["items"]) == 2
    assert current["data_sufficiency"] == "sufficient"
    assert later["score"] < current["components"]["items"][0]["points"]


def test_growth_and_contraction_use_directionally_relevant_signals():
    rows = [
        signal("hire", "jobs", "hiring_acceleration", "2026-10-01T00:00:00"),
        signal("facility", "permits", "facility_expansion", "2026-10-02T00:00:00"),
        signal("layoff", "warn", "layoff", "2026-10-03T00:00:00"),
        signal("bankruptcy", "court", "bankruptcy", "2026-10-04T00:00:00"),
    ]
    growth = build_change_assessment("company-1", rows, as_of_date=AS_OF, assessment_type="growth")
    contraction = build_change_assessment("company-1", rows, as_of_date=AS_OF, assessment_type="contraction")
    assert {item["indicator_type"] for item in growth["components"]["items"]} == {"hiring_acceleration", "facility_expansion"}
    assert {item["indicator_type"] for item in contraction["components"]["items"]} == {"layoff", "bankruptcy"}


def test_alert_threshold_ignores_one_point_changes():
    assert material_indication_change(39, 40)
    assert material_indication_change(50, 65)
    assert not material_indication_change(50, 51)
    assert not material_indication_change(70, 60)
