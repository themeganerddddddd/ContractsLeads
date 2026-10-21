from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from .features import (
    CONTRACT_CHANGE_FEATURES,
    NEW_AWARD_FEATURES,
    build_feature_snapshot,
    feature_reasons,
    momentum_snapshot,
)
from .metrics import classification_metrics, probability_gate
from .model import LogisticModel


OUTCOME_EVENTS = {
    "new_award": {"award_announced"},
    "contract_change": {"contract_modified", "value_increased", "value_decreased", "option_exercised"},
    "renewal_recompete": {"renewal_expected", "award_announced"},
}


def _event_date(event: dict[str, Any]) -> date:
    value = event["event_at"]
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()


def outcome_after(events: list[dict[str, Any]], cutoff: date, horizon: int, prediction_type: str) -> int:
    end = cutoff + timedelta(days=horizon)
    return int(any(cutoff < _event_date(event) <= end and event.get("event_type") in OUTCOME_EVENTS[prediction_type] for event in events))


def rolling_cutoffs(start: date, end: date, step_days: int = 30) -> list[date]:
    cutoffs = []
    current = start
    while current <= end:
        cutoffs.append(current)
        current += timedelta(days=step_days)
    return cutoffs


class IntelligenceService:
    def __init__(self, repository: Any):
        self.repository = repository

    @staticmethod
    def _features(prediction_type: str) -> tuple[str, ...]:
        return NEW_AWARD_FEATURES if prediction_type == "new_award" else CONTRACT_CHANGE_FEATURES

    def _samples(self, prediction_type: str, cutoffs: list[date], horizon: int) -> tuple[list[dict[str, float]], list[int]]:
        rows: list[dict[str, float]] = []
        labels: list[int] = []
        for entity_id in self.repository.candidate_ids(prediction_type):
            events = self.repository.events_for(prediction_type, entity_id)
            end = self.repository.contract_end(entity_id) if prediction_type != "new_award" else None
            for cutoff in cutoffs:
                snapshot = build_feature_snapshot(events, cutoff, prediction_type, contract_end_date=end)
                if snapshot["history_days"] < 30:
                    continue
                rows.append(snapshot)
                labels.append(outcome_after(events, cutoff, horizon, prediction_type))
        return rows, labels

    def train_backtest(
        self,
        prediction_type: str,
        *,
        training_end: date,
        validation_end: date,
        test_end: date,
        horizon: int = 90,
    ) -> dict[str, Any]:
        if not (training_end < validation_end < test_end):
            raise ValueError("training_end, validation_end, and test_end must be strictly increasing")
        observation_start, observed_end = self.repository.event_bounds()
        version = f"{prediction_type}-{training_end.isoformat()}-{test_end.isoformat()}-h{horizon}"
        feature_names = list(self._features(prediction_type))
        provenance = {
            "source": "procurement_events",
            "point_in_time_rule": "features use event_at <= cutoff; outcomes use cutoff < event_at <= cutoff+horizon",
            "training_end": training_end.isoformat(),
            "validation_end": validation_end.isoformat(),
            "test_end": test_end.isoformat(),
        }
        insufficient_reason = None
        if not observation_start or not observed_end or (observed_end - observation_start).days < 180:
            insufficient_reason = "At least 180 days of observed official event history are required."
        train_start = observation_start or training_end
        training_cutoffs = rolling_cutoffs(train_start + timedelta(days=30), training_end - timedelta(days=horizon)) if train_start + timedelta(days=30) <= training_end - timedelta(days=horizon) else []
        test_start = validation_end + timedelta(days=1)
        test_cutoffs = rolling_cutoffs(test_start, test_end - timedelta(days=horizon)) if test_start <= test_end - timedelta(days=horizon) else []
        train_rows, train_labels = self._samples(prediction_type, training_cutoffs, horizon)
        test_rows, test_labels = self._samples(prediction_type, test_cutoffs, horizon)
        if len(train_rows) < 50 or len(set(train_labels)) < 2:
            insufficient_reason = insufficient_reason or "Training requires at least 50 samples containing both outcomes."

        if insufficient_reason:
            payload = {
                "model_type": prediction_type,
                "version": version,
                "algorithm": "regularized_logistic_regression",
                "observation_start": observation_start,
                "training_end": training_end,
                "validation_end": validation_end,
                "test_end": test_end,
                "horizons": [horizon],
                "feature_names": feature_names,
                "coefficients": {"weights": {name: 0.0 for name in feature_names}, "means": {name: 0.0 for name in feature_names}, "scales": {name: 1.0 for name in feature_names}},
                "intercept": 0.0,
                "sample_counts": {"training": len(train_rows), "test": len(test_rows), "positives": sum(test_labels), "negatives": len(test_labels) - sum(test_labels)},
                "metrics": {},
                "probability_eligible": False,
                "status": "insufficient_history",
                "data_provenance": provenance,
                "notes": insufficient_reason,
            }
            payload["model_id"] = self.repository.persist_model(payload)
            return payload

        model = LogisticModel.fit(train_rows, train_labels, feature_names)
        test_probabilities = [model.predict_proba(row) for row in test_rows]
        metrics = classification_metrics(test_labels, test_probabilities)
        counts = {"samples": len(test_rows), "positives": sum(test_labels), "negatives": len(test_labels) - sum(test_labels)}
        eligible, gate_reasons = probability_gate(metrics, counts)
        payload = {
            "model_type": prediction_type,
            "version": version,
            "algorithm": "regularized_logistic_regression",
            "observation_start": observation_start,
            "training_end": training_end,
            "validation_end": validation_end,
            "test_end": test_end,
            "horizons": [horizon],
            "feature_names": feature_names,
            "coefficients": model.as_json(),
            "intercept": model.intercept,
            "sample_counts": {"training": len(train_rows), "test": len(test_rows), **counts},
            "metrics": metrics,
            "probability_eligible": eligible,
            "status": "active" if eligible else "rejected",
            "data_provenance": provenance,
            "notes": None if eligible else "; ".join(gate_reasons),
        }
        payload["model_id"] = self.repository.persist_model(payload)
        return payload

    def predict(self, prediction_type: str, as_of: date, horizons: list[int]) -> dict[str, Any]:
        stored = self.repository.latest_model(prediction_type)
        if not stored:
            raise ValueError(f"no {prediction_type} model has been trained")
        model = LogisticModel.from_json(
            list(stored["feature_names"]), dict(stored["coefficients"]), float(stored["intercept"])
        )
        stats = {"model_id": str(stored["id"]), "generated": 0, "sufficient": 0, "insufficient": 0}
        for entity_id in self.repository.candidate_ids(prediction_type):
            events = self.repository.events_for(prediction_type, entity_id)
            end = self.repository.contract_end(entity_id) if prediction_type != "new_award" else None
            snapshot = build_feature_snapshot(events, as_of, prediction_type, contract_end_date=end)
            if prediction_type == "new_award":
                entity_field, persisted_entity_id = "company_id", entity_id
            else:
                kind, persisted_entity_id = entity_id.split(":", 1)
                entity_field = "award_id" if kind == "award" else "process_id"
            for horizon in horizons:
                sufficient = bool(stored["probability_eligible"]) and snapshot["history_days"] >= 90
                probability = model.predict_proba(snapshot) if sufficient else None
                band = None if probability is None else "high" if probability >= 0.67 else "medium" if probability >= 0.34 else "low"
                inserted = self.repository.persist_prediction({
                    "model_id": str(stored["id"]),
                    "prediction_type": prediction_type,
                    "as_of_date": as_of,
                    "horizon_days": horizon,
                    entity_field: persisted_entity_id,
                    "probability": probability,
                    "likelihood_band": band,
                    "data_sufficiency": "sufficient" if sufficient else "failed_calibration" if stored["status"] == "rejected" else "insufficient_history",
                    "reasons": feature_reasons(snapshot),
                    "feature_snapshot": snapshot,
                })
                stats["generated"] += int(inserted)
                stats["sufficient" if sufficient else "insufficient"] += int(inserted)
        return stats

    def momentum(self, as_of: date) -> dict[str, int]:
        stats = {"generated": 0, "sufficient": 0, "insufficient": 0}
        for company_id in self.repository.candidate_ids("new_award"):
            snapshot = momentum_snapshot(self.repository.events_for("new_award", company_id), as_of)
            inserted = self.repository.persist_momentum(company_id, as_of, snapshot)
            stats["generated"] += int(inserted)
            stats["sufficient" if snapshot["score"] is not None else "insufficient"] += int(inserted)
        return stats
