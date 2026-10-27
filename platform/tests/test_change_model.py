from __future__ import annotations

from datetime import date, datetime, timezone

import pytest

from intelligence.change_features import build_company_feature_snapshot
from intelligence.change_service import ChangeIntelligenceService, baseline_probabilities, point_in_time_examples


def test_change_feature_snapshot_blocks_future_records():
    records = [
        {"event_at": "2026-01-01T00:00:00Z", "observed_at": "2026-01-01T00:00:00Z", "event_type": "award_announced", "source_system": "procurement"},
        {"event_at": "2026-07-01T00:00:00Z", "observed_at": "2026-07-01T00:00:00Z", "event_type": "facility_expansion", "source_system": "press"},
    ]
    snapshot = build_company_feature_snapshot(
        "company-1", records, as_of_date=date(2026, 6, 1), model_type="company_expansion",
    )
    assert snapshot["feature_values"]["facilities_opened_365d"] == 0
    assert snapshot["feature_values"]["contracts_365d"] == 1


def test_early_growth_uses_only_post_formation_evidence():
    records = [
        {"event_at": "2026-01-01T00:00:00Z", "observed_at": "2026-01-01T00:00:00Z", "event_type": "hiring", "signal_family": "workforce", "posting_count": 50, "source_system": "jobs"},
        {"event_at": "2026-04-01T00:00:00Z", "observed_at": "2026-04-01T00:00:00Z", "event_type": "hiring", "signal_family": "workforce", "posting_count": 5, "source_system": "jobs"},
    ]
    snapshot = build_company_feature_snapshot(
        "company-1", records, as_of_date=date(2026, 6, 1), model_type="company_growth", formation_date=date(2026, 3, 1),
    )
    assert snapshot["feature_values"]["job_postings_365d"] == 5


def test_point_in_time_labeling_rejects_leaky_snapshot():
    snapshots = [{
        "company_id": "company-1", "as_of_date": date(2026, 1, 1),
        "feature_observation_cutoff": datetime(2026, 1, 2, tzinfo=timezone.utc), "feature_values": {"x": 1.0},
    }]
    with pytest.raises(ValueError, match="after"):
        point_in_time_examples(snapshots, [], model_type="company_expansion", horizon=90)


def test_probability_remains_hidden_when_chronological_history_is_insufficient():
    class Repository:
        def __init__(self): self.persisted = None
        def change_feature_rows(self, model_type, through): return []
        def change_outcome_rows(self, model_type, through): return []
        def persist_model(self, payload): self.persisted = payload; return "model-1"

    repository = Repository()
    result = ChangeIntelligenceService(repository).backtest(
        "company_expansion", training_end=date(2025, 6, 1), validation_end=date(2025, 12, 1),
        test_end=date(2026, 6, 1), horizon=180,
    )
    assert result["status"] == "insufficient_history"
    assert result["probability_eligible"] is False
    assert result["metrics"] == {}
    assert repository.persisted["probability_eligible"] is False


def test_each_change_model_has_a_relevant_nonconstant_baseline():
    row = {"feature_values": {"facilities_opened_365d": 1, "relocation_destination_signals_365d": 1,
                              "contract_acceleration_90d": 1, "warn_signals_365d": 1,
                              "new_registrations": 10, "previous_year_registrations": 5,
                              "rolling_average_registrations": 4}}
    for model_type in ("company_expansion", "company_relocation", "company_growth", "company_contraction", "business_formation"):
        baselines = baseline_probabilities(model_type, [row], 0.1)
        assert len(baselines) == 2
        assert baselines["historical_event_rate"] == [0.1]
        assert max(values[0] for name, values in baselines.items() if name != "historical_event_rate") > 0.1
