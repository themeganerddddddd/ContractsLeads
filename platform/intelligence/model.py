from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable


def _sigmoid(value: float) -> float:
    if value >= 0:
        factor = math.exp(-min(value, 700))
        return 1 / (1 + factor)
    factor = math.exp(max(value, -700))
    return factor / (1 + factor)


@dataclass
class LogisticModel:
    feature_names: list[str]
    weights: list[float]
    means: list[float]
    scales: list[float]
    intercept: float

    @classmethod
    def fit(
        cls,
        rows: list[dict[str, float]],
        labels: list[int],
        feature_names: Iterable[str],
        *,
        learning_rate: float = 0.08,
        iterations: int = 800,
        l2: float = 0.01,
    ) -> "LogisticModel":
        names = list(feature_names)
        if not rows or len(rows) != len(labels):
            raise ValueError("feature rows and labels must be non-empty and aligned")
        matrix = [[float(row[name]) for name in names] for row in rows]
        means = [sum(row[index] for row in matrix) / len(matrix) for index in range(len(names))]
        scales = []
        for index, mean in enumerate(means):
            variance = sum((row[index] - mean) ** 2 for row in matrix) / len(matrix)
            scales.append(math.sqrt(variance) or 1.0)
        standardized = [[(row[index] - means[index]) / scales[index] for index in range(len(names))] for row in matrix]
        weights = [0.0] * len(names)
        positive_rate = min(1 - 1e-6, max(1e-6, sum(labels) / len(labels)))
        intercept = math.log(positive_rate / (1 - positive_rate))
        for _ in range(iterations):
            predictions = [_sigmoid(intercept + sum(weight * value for weight, value in zip(weights, row))) for row in standardized]
            errors = [prediction - label for prediction, label in zip(predictions, labels)]
            intercept -= learning_rate * sum(errors) / len(errors)
            for index in range(len(weights)):
                gradient = sum(error * row[index] for error, row in zip(errors, standardized)) / len(errors)
                weights[index] -= learning_rate * (gradient + l2 * weights[index])
        return cls(names, weights, means, scales, intercept)

    def predict_proba(self, row: dict[str, float]) -> float:
        values = [(float(row[name]) - mean) / scale for name, mean, scale in zip(self.feature_names, self.means, self.scales)]
        return _sigmoid(self.intercept + sum(weight * value for weight, value in zip(self.weights, values)))

    def as_json(self) -> dict[str, object]:
        return {
            "weights": dict(zip(self.feature_names, self.weights)),
            "means": dict(zip(self.feature_names, self.means)),
            "scales": dict(zip(self.feature_names, self.scales)),
        }

    @classmethod
    def from_json(cls, feature_names: list[str], payload: dict[str, object], intercept: float) -> "LogisticModel":
        weights = payload["weights"]
        means = payload["means"]
        scales = payload["scales"]
        assert isinstance(weights, dict) and isinstance(means, dict) and isinstance(scales, dict)
        return cls(
            feature_names,
            [float(weights[name]) for name in feature_names],
            [float(means[name]) for name in feature_names],
            [float(scales[name]) for name in feature_names],
            float(intercept),
        )
