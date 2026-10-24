from datetime import date, datetime, timezone

from movements.scoring import build_movement_assessment


def indicator(identifier, source, kind, observed, *, direction="positive", event_id=None):
    return {
        "id": identifier,
        "indicator_fingerprint": identifier,
        "event_id": event_id,
        "associated_event_ids": [event_id] if event_id else [],
        "source_system": source,
        "indicator_type": kind,
        "direction": direction,
        "observed_at": observed,
        "strength": 0.9,
        "reliability": 0.95,
        "confidence": 0.9,
        "country_code": "US",
        "state_code": "MD",
        "county_fips": "24031",
    }


AS_OF = date(2026, 10, 23)


def test_assessment_is_reproducible_and_explainable():
    rows = [
        indicator("1", "official_permits", "major_permit", datetime(2026, 10, 1, tzinfo=timezone.utc)),
        indicator("2", "official_press", "expansion_announcement", datetime(2026, 10, 2, tzinfo=timezone.utc)),
    ]
    first = build_movement_assessment("company", rows, as_of_date=AS_OF, assessment_type="growth", state_code="MD")
    second = build_movement_assessment("company", reversed(rows), as_of_date=AS_OF, assessment_type="growth", state_code="MD")
    assert first["score"] == second["score"]
    assert first["assessment_fingerprint"] == second["assessment_fingerprint"]
    assert first["data_sufficiency"] == "sufficient"
    assert first["components"]["source_count"] == 2
    assert "time decay" in first["explanation"]


def test_low_data_company_gets_no_score():
    result = build_movement_assessment(
        "company",
        [indicator("1", "official_press", "expansion_announcement", datetime(2026, 10, 2, tzinfo=timezone.utc))],
        as_of_date=AS_OF,
        assessment_type="growth",
    )
    assert result["score"] is None
    assert result["data_sufficiency"] == "limited"
    assert result["evidence_quality"] == "insufficient"


def test_repeated_coverage_of_one_event_is_deduplicated():
    rows = [
        indicator("1", "press_a", "expansion_announcement", datetime(2026, 10, 1, tzinfo=timezone.utc), event_id="event-1"),
        indicator("2", "press_b", "news_repeat", datetime(2026, 10, 2, tzinfo=timezone.utc), event_id="event-1"),
    ]
    result = build_movement_assessment("company", rows, as_of_date=AS_OF, assessment_type="growth")
    assert result["components"]["indicator_count"] == 1
    assert result["score"] is None


def test_point_in_time_assessment_excludes_later_observations():
    rows = [
        indicator("1", "permit", "major_permit", datetime(2026, 10, 1, tzinfo=timezone.utc)),
        indicator("2", "press", "expansion_announcement", datetime(2026, 10, 24, tzinfo=timezone.utc)),
    ]
    result = build_movement_assessment("company", rows, as_of_date=AS_OF, assessment_type="growth")
    assert result["components"]["indicator_count"] == 1
    assert result["score"] is None
