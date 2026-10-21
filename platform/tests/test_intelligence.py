from __future__ import annotations

from datetime import date, datetime, timezone

from intelligence.features import build_feature_snapshot, momentum_snapshot
from intelligence.metrics import classification_metrics, probability_gate
from intelligence.model import LogisticModel
from intelligence.service import IntelligenceService, outcome_after


def event(day, event_type, value=None, buyer="buyer-1"):
    return {"event_at": datetime.fromisoformat(day).replace(tzinfo=timezone.utc), "event_type": event_type, "value_delta_native": value, "buyer_id": buyer}


def test_feature_generation_has_no_future_leakage():
    events = [event("2025-01-01T00:00:00", "award_announced"), event("2025-04-01T00:00:00", "contract_modified")]
    before = build_feature_snapshot(events, date(2025, 3, 1), "new_award")
    without_future = build_feature_snapshot(events[:1], date(2025, 3, 1), "new_award")
    assert before == without_future
    assert outcome_after(events, date(2025, 3, 1), 60, "contract_change") == 1


def test_transparent_logistic_model_round_trips_coefficients():
    rows = [{"x": float(value)} for value in range(10)]
    labels = [0] * 5 + [1] * 5
    model = LogisticModel.fit(rows, labels, ["x"])
    restored = LogisticModel.from_json(["x"], model.as_json(), model.intercept)
    assert restored.predict_proba({"x": 9}) > restored.predict_proba({"x": 0})


def test_metrics_and_probability_gate_reject_tiny_backtest():
    labels = [0, 0, 1, 1]
    probabilities = [0.1, 0.2, 0.8, 0.9]
    metrics = classification_metrics(labels, probabilities)
    eligible, reasons = probability_gate(metrics, {"samples": 4, "positives": 2, "negatives": 2})
    assert metrics["roc_auc"] == 1.0
    assert eligible is False
    assert any("100" in reason for reason in reasons)


def test_momentum_is_an_index_and_requires_observation_history():
    insufficient = momentum_snapshot([event("2025-01-01T00:00:00", "award_announced")], date(2025, 2, 1))
    sufficient = momentum_snapshot([
        event("2025-01-01T00:00:00", "award_announced"),
        event("2025-04-01T00:00:00", "contract_modified", 10),
        event("2025-05-01T00:00:00", "value_increased", 25, "buyer-2"),
    ], date(2025, 6, 1))
    assert insufficient["score"] is None
    assert 0 <= sufficient["score"] <= 100
    assert "not a probability" in sufficient["explanation"]


def test_backtest_persists_insufficient_history_instead_of_a_probability_model():
    class Repository:
        def __init__(self): self.persisted = None
        def event_bounds(self): return date(2025, 1, 1), date(2025, 1, 1)
        def candidate_ids(self, kind): return []
        def persist_model(self, payload): self.persisted = payload; return "model-1"

    repository = Repository()
    result = IntelligenceService(repository).train_backtest(
        "new_award", training_end=date(2025, 3, 1), validation_end=date(2025, 6, 1), test_end=date(2025, 9, 1)
    )
    assert result["status"] == "insufficient_history"
    assert result["probability_eligible"] is False
    assert "180 days" in result["notes"]
