from __future__ import annotations

import math
from typing import Any


def roc_auc(labels: list[int], probabilities: list[float]) -> float | None:
    positives = sum(labels)
    negatives = len(labels) - positives
    if not positives or not negatives:
        return None
    ranked = sorted(zip(probabilities, labels), key=lambda item: item[0])
    rank_sum = 0.0
    index = 0
    while index < len(ranked):
        end = index
        while end + 1 < len(ranked) and ranked[end + 1][0] == ranked[index][0]:
            end += 1
        average_rank = (index + 1 + end + 1) / 2
        rank_sum += average_rank * sum(label for _, label in ranked[index:end + 1])
        index = end + 1
    return (rank_sum - positives * (positives + 1) / 2) / (positives * negatives)


def pr_auc(labels: list[int], probabilities: list[float]) -> float | None:
    positives = sum(labels)
    if not positives:
        return None
    ordered = sorted(zip(probabilities, labels), reverse=True)
    true_positives = false_positives = 0
    previous_recall = 0.0
    area = 0.0
    for _, label in ordered:
        true_positives += label
        false_positives += 1 - label
        recall = true_positives / positives
        precision = true_positives / (true_positives + false_positives)
        area += (recall - previous_recall) * precision
        previous_recall = recall
    return area


def calibration_buckets(labels: list[int], probabilities: list[float], count: int = 10) -> list[dict[str, Any]]:
    buckets = []
    for index in range(count):
        lower, upper = index / count, (index + 1) / count
        values = [(label, probability) for label, probability in zip(labels, probabilities) if lower <= probability < upper or (index == count - 1 and probability == 1)]
        if values:
            buckets.append({
                "lower": lower,
                "upper": upper,
                "count": len(values),
                "mean_prediction": sum(probability for _, probability in values) / len(values),
                "observed_rate": sum(label for label, _ in values) / len(values),
            })
    return buckets


def classification_metrics(labels: list[int], probabilities: list[float], threshold: float = 0.5) -> dict[str, Any]:
    if not labels or len(labels) != len(probabilities):
        raise ValueError("labels and probabilities must be non-empty and aligned")
    epsilon = 1e-12
    predicted = [int(probability >= threshold) for probability in probabilities]
    true_positive = sum(label == 1 and guess == 1 for label, guess in zip(labels, predicted))
    false_positive = sum(label == 0 and guess == 1 for label, guess in zip(labels, predicted))
    false_negative = sum(label == 1 and guess == 0 for label, guess in zip(labels, predicted))
    brier = sum((probability - label) ** 2 for label, probability in zip(labels, probabilities)) / len(labels)
    log_loss = -sum(
        label * math.log(max(epsilon, min(1 - epsilon, probability)))
        + (1 - label) * math.log(max(epsilon, min(1 - epsilon, 1 - probability)))
        for label, probability in zip(labels, probabilities)
    ) / len(labels)
    return {
        "roc_auc": roc_auc(labels, probabilities),
        "pr_auc": pr_auc(labels, probabilities),
        "brier": brier,
        "log_loss": log_loss,
        "precision_at_0_5": true_positive / (true_positive + false_positive) if true_positive + false_positive else None,
        "recall_at_0_5": true_positive / (true_positive + false_negative) if true_positive + false_negative else None,
        "base_rate": sum(labels) / len(labels),
        "calibration": calibration_buckets(labels, probabilities),
    }


def probability_gate(metrics: dict[str, Any], counts: dict[str, int]) -> tuple[bool, list[str]]:
    reasons = []
    if counts.get("samples", 0) < 100:
        reasons.append("fewer than 100 out-of-time test samples")
    if counts.get("positives", 0) < 10 or counts.get("negatives", 0) < 10:
        reasons.append("fewer than 10 positive or negative outcomes")
    base_rate = float(metrics.get("base_rate") or 0)
    baseline_brier = base_rate * (1 - base_rate)
    if metrics.get("brier") is None or float(metrics["brier"]) >= baseline_brier:
        reasons.append("Brier score does not beat the constant-rate baseline")
    if metrics.get("roc_auc") is None or float(metrics["roc_auc"]) < 0.55:
        reasons.append("ROC AUC is below 0.55")
    return not reasons, reasons
