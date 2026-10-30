from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RolloutFactors:
    business_density: float
    commercial_value: float
    source_quality: float
    automation_feasibility: float
    reuse_clarity: float
    update_frequency: float
    location_specificity: float


WEIGHTS = {
    "business_density": 0.20,
    "commercial_value": 0.20,
    "source_quality": 0.15,
    "automation_feasibility": 0.15,
    "reuse_clarity": 0.10,
    "update_frequency": 0.10,
    "location_specificity": 0.10,
}


def rollout_score(factors: RolloutFactors) -> float:
    """Return an explainable 0-100 source rollout score.

    Inputs are normalized 0-100 evidence-backed ratings. Customer demand is
    intentionally excluded so the score remains source- and market-focused.
    """
    values = factors.__dict__
    for name, value in values.items():
        if value < 0 or value > 100:
            raise ValueError(f"{name} must be between 0 and 100")
    return round(sum(values[name] * weight for name, weight in WEIGHTS.items()), 2)


def rollout_score_detail(factors: RolloutFactors) -> dict[str, object]:
    score = rollout_score(factors)
    return {
        "score": score,
        "factors": factors.__dict__,
        "weights": WEIGHTS,
        "methodology": "businesscurrent-source-rollout-v1",
    }
