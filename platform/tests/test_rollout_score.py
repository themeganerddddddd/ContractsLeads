from __future__ import annotations

import pytest

from operations.rollout import RolloutFactors, rollout_score, rollout_score_detail


def test_rollout_score_is_weighted_explainable_and_customer_demand_free():
    factors = RolloutFactors(90, 80, 70, 60, 50, 40, 30)
    detail = rollout_score_detail(factors)
    assert rollout_score(factors) == 65.5
    assert detail["score"] == 65.5
    assert "customer_demand" not in detail["factors"]


def test_rollout_score_rejects_unbounded_inputs():
    with pytest.raises(ValueError, match="reuse_clarity"):
        rollout_score(RolloutFactors(1, 1, 1, 1, 101, 1, 1))
