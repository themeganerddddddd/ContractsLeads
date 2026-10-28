from __future__ import annotations

import statistics
from datetime import date, datetime, timedelta
from typing import Any

from .metrics import classification_metrics, probability_gate
from .model import LogisticModel


COMPANY_MODEL_TYPES = {
    "company_expansion": {"expansion", "new_facility", "market_entry"},
    "company_relocation": {"relocation"},
    "company_growth": {"growth", "expansion", "new_facility", "market_entry"},
    "company_contraction": {"contraction", "closure"},
}
FORMATION_MODEL_TYPE = "business_formation"
MODEL_TYPES = {*COMPANY_MODEL_TYPES, FORMATION_MODEL_TYPE}
COMPANY_HORIZONS = {90, 180, 365}
FORMATION_HORIZONS = {3, 6, 12}


def _date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _unit_key(row: dict[str, Any], model_type: str) -> tuple[Any, ...]:
    if model_type == FORMATION_MODEL_TYPE:
        return (row.get("country_code"), row.get("state_code"), row.get("county_fips"), row.get("industry_code"))
    return (row.get("company_id"),)


def point_in_time_examples(
    snapshots: list[dict[str, Any]],
    outcomes: list[dict[str, Any]],
    *,
    model_type: str,
    horizon: int,
) -> list[dict[str, Any]]:
    """Label persisted feature snapshots without allowing post-cutoff source observations."""
    if model_type not in MODEL_TYPES:
        raise ValueError(f"unsupported change model: {model_type}")
    if model_type == FORMATION_MODEL_TYPE and horizon not in FORMATION_HORIZONS:
        raise ValueError("business-formation horizons are 3, 6, or 12 months")
    if model_type != FORMATION_MODEL_TYPE and horizon not in COMPANY_HORIZONS:
        raise ValueError("company-change horizons are 90, 180, or 365 days")
    allowed = {"formation"} if model_type == FORMATION_MODEL_TYPE else COMPANY_MODEL_TYPES[model_type]
    result: list[dict[str, Any]] = []
    for snapshot in snapshots:
        cutoff = _date(snapshot["as_of_date"])
        observation_cutoff = snapshot.get("feature_observation_cutoff")
        if observation_cutoff and _date(observation_cutoff) > cutoff:
            raise ValueError("feature snapshot contains observations after its prediction cutoff")
        end = cutoff + timedelta(days=horizon * 30 if model_type == FORMATION_MODEL_TYPE else horizon)
        unit = _unit_key(snapshot, model_type)
        positives = [
            outcome for outcome in outcomes
            if outcome.get("outcome_type") in allowed
            and _unit_key(outcome, model_type) == unit
            and cutoff < _date(outcome["outcome_date"]) <= end
        ]
        row = dict(snapshot)
        row["label"] = int(bool(positives))
        row["lead_time_days"] = min((_date(item["outcome_date"]) - cutoff).days for item in positives) if positives else None
        result.append(row)
    return result


def baseline_probabilities(
    model_type: str, rows: list[dict[str, Any]], historical_rate: float,
) -> dict[str, list[float]]:
    """Relevant, intentionally simple baselines that a candidate model must beat."""
    low, high = max(0.01, historical_rate - 0.2), min(0.99, historical_rate + 0.2)
    constant = [historical_rate] * len(rows)
    rule: list[float] = []
    for row in rows:
        features = dict(row.get("feature_values") or {})
        if model_type == "company_expansion":
            active = float(features.get("facilities_opened_365d", 0)) > 0 or float(features.get("job_posting_acceleration_90d", 0)) > 0
        elif model_type == "company_relocation":
            active = float(features.get("relocation_destination_signals_365d", 0)) > 0
        elif model_type == "company_growth":
            active = float(features.get("contract_acceleration_90d", 0)) > 0 or float(features.get("job_posting_acceleration_90d", 0)) > 0
        elif model_type == "company_contraction":
            active = float(features.get("warn_signals_365d", 0)) > 0 or float(features.get("facilities_closed_365d", 0)) > 0
        else:
            current = float(features.get("new_registrations", 0))
            previous = float(features.get("previous_year_registrations", current))
            rolling = float(features.get("rolling_average_registrations", current))
            active = current > max(previous, rolling)
        rule.append(high if active else low)
    rule_name = {
        "company_expansion": "recent_activity_rule", "company_relocation": "address_or_destination_change_rule",
        "company_growth": "previous_period_trend", "company_contraction": "previous_period_trend",
        "business_formation": "previous_year_and_rolling_average",
    }[model_type]
    return {"historical_event_rate": constant, rule_name: rule}


class ChangeIntelligenceService:
    """Chronological, auditable logistic baselines for company-change outcomes."""

    def __init__(self, repository: Any):
        self.repository = repository

    def backtest(
        self,
        model_type: str,
        *,
        training_end: date,
        validation_end: date,
        test_end: date,
        horizon: int,
    ) -> dict[str, Any]:
        if not (training_end < validation_end < test_end):
            raise ValueError("training_end, validation_end, and test_end must be strictly increasing")
        snapshots = self.repository.change_feature_rows(model_type, test_end)
        outcomes = self.repository.change_outcome_rows(model_type, test_end)
        examples = point_in_time_examples(snapshots, outcomes, model_type=model_type, horizon=horizon)
        train = [row for row in examples if _date(row["as_of_date"]) <= training_end]
        validation = [row for row in examples if training_end < _date(row["as_of_date"]) <= validation_end]
        test = [row for row in examples if validation_end < _date(row["as_of_date"]) <= test_end]
        feature_names = sorted({key for row in examples for key, value in dict(row.get("feature_values") or {}).items() if isinstance(value, (int, float))})
        historical_dates = [_date(row["as_of_date"]) for row in examples]
        historical_span = (max(historical_dates) - min(historical_dates)).days if historical_dates else 0
        positives, negatives = sum(int(row["label"]) for row in test), sum(not int(row["label"]) for row in test)
        reasons = []
        if historical_span < 365:
            reasons.append("At least 365 days of point-in-time feature history are required.")
        if len(train) < 50 or len({row["label"] for row in train}) < 2:
            reasons.append("Training requires at least 50 samples containing positive and negative outcomes.")
        if not validation:
            reasons.append("A later chronological validation period is required.")
        if len(test) < 100 or positives < 10 or negatives < 10:
            reasons.append("Out-of-time testing requires at least 100 samples with 10 positive and 10 negative outcomes.")
        if not feature_names:
            reasons.append("No numeric point-in-time features are available.")
        version = f"{model_type}-point-in-time-v1-{training_end}-{test_end}-h{horizon}"
        base_payload = {
            "model_type": model_type,
            "version": version,
            "algorithm": "regularized_logistic_regression",
            "observation_start": min(historical_dates) if historical_dates else None,
            "training_end": training_end,
            "validation_end": validation_end,
            "test_end": test_end,
            "horizons": [horizon],
            "feature_names": feature_names,
            "sample_counts": {
                "training": len(train), "validation": len(validation), "test": len(test),
                "samples": len(test), "positives": positives, "negatives": negatives,
                "historical_span_days": historical_span,
            },
            "data_provenance": {
                "features": "company_change_feature_snapshots",
                "labels": "company_outcomes",
                "unit": "geography_industry" if model_type == FORMATION_MODEL_TYPE else "company",
                "split": "chronological_train_validation_untouched_test",
                "point_in_time_rule": "feature_observation_cutoff must be on or before as_of_date; labels occur after cutoff",
                "baseline": "rolling geography-industry average and prior-year rate" if model_type == FORMATION_MODEL_TYPE else "historical event rate",
            },
        }
        if reasons:
            payload = {
                **base_payload,
                "coefficients": {"weights": {name: 0.0 for name in feature_names}, "means": {}, "scales": {}},
                "intercept": 0.0, "metrics": {}, "probability_eligible": False,
                "status": "insufficient_history", "notes": "; ".join(reasons),
            }
            payload["model_id"] = self.repository.persist_model(payload)
            return payload

        train_features = [dict(row["feature_values"]) for row in train]
        train_labels = [int(row["label"]) for row in train]
        model = LogisticModel.fit(train_features, train_labels, feature_names)
        probabilities = [model.predict_proba(dict(row["feature_values"])) for row in test]
        labels = [int(row["label"]) for row in test]
        metrics = classification_metrics(labels, probabilities)
        historical_rate = sum(train_labels) / len(train_labels)
        baseline_metrics = {
            name: classification_metrics(labels, values)
            for name, values in baseline_probabilities(model_type, test, historical_rate).items()
        }
        guesses = [probability >= 0.5 for probability in probabilities]
        false_positive = sum(guess and not label for guess, label in zip(guesses, labels))
        false_negative = sum(not guess and label for guess, label in zip(guesses, labels))
        lead_times = [int(row["lead_time_days"]) for row in test if row.get("lead_time_days") is not None]
        metrics.update({
            "false_positive_rate": false_positive / negatives if negatives else None,
            "false_negative_rate": false_negative / positives if positives else None,
            "median_lead_time_days": statistics.median(lead_times) if lead_times else None,
            "geographic_accuracy": None,
            "destination_accuracy": None,
            "top_3_destination_accuracy": None,
            "baselines": baseline_metrics,
        })
        eligible, gate_reasons = probability_gate(metrics, {"samples": len(test), "positives": positives, "negatives": negatives})
        best_baseline_brier = min(float(item["brier"]) for item in baseline_metrics.values())
        if float(metrics["brier"]) >= best_baseline_brier:
            eligible = False
            gate_reasons.append("Brier score does not beat every required relevant baseline")
        payload = {
            **base_payload, "coefficients": model.as_json(), "intercept": model.intercept,
            "metrics": metrics, "probability_eligible": eligible,
            "status": "active" if eligible else "rejected",
            "notes": None if eligible else "; ".join(gate_reasons),
        }
        payload["model_id"] = self.repository.persist_model(payload)
        return payload
