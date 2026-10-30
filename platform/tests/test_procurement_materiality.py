from decimal import Decimal

import pytest

from procurement_materiality import (
    AWARD_ADJUSTMENT_ABSOLUTE_USD,
    AWARD_ADJUSTMENT_MATERIALITY_RATIO,
    best_reference_award_value,
    evaluate_award_adjustment,
)


@pytest.mark.parametrize("adjustment", ["10000", "-10000", "50000"])
def test_small_adjustments_remain_visible_but_amount_is_immaterial(adjustment):
    result = evaluate_award_adjustment(adjustment, "10000000" if abs(Decimal(adjustment)) == 10000 else "500000000", "USD")
    assert result.status == "immaterial"
    assert not result.relative_material
    assert not result.absolute_material


@pytest.mark.parametrize("adjustment", ["600000", "-600000"])
def test_five_percent_relative_threshold_is_direction_neutral(adjustment):
    result = evaluate_award_adjustment(adjustment, "10000000", "USD")
    assert result.status == "material"
    assert result.percent == Decimal("6.00")
    assert result.relative_material


@pytest.mark.parametrize("adjustment", ["2000000", "-2000000"])
def test_usd_absolute_threshold_is_direction_neutral(adjustment):
    result = evaluate_award_adjustment(adjustment, "500000000", "USD")
    assert result.status == "material"
    assert result.absolute_material


def test_missing_denominator_does_not_invent_a_percentage():
    result = evaluate_award_adjustment("10000", None, "USD")
    assert result.status == "unknown"
    assert result.percent is None


def test_zero_dollar_modification_is_immaterial_without_a_denominator():
    result = evaluate_award_adjustment("0", None, "USD")
    assert result.status == "immaterial"
    assert result.percent is None


def test_non_usd_absolute_threshold_requires_reliable_conversion():
    native = evaluate_award_adjustment("2000000", "100000000", "EUR")
    converted = evaluate_award_adjustment("2000000", "100000000", "EUR", adjustment_usd="1200000")
    assert native.status == "immaterial"
    assert converted.status == "material"
    assert converted.absolute_material


def test_reference_hierarchy_uses_first_positive_nonzero_value():
    assert best_reference_award_value(None, "0", "-10000000", "9000000") == Decimal("10000000")
    assert AWARD_ADJUSTMENT_MATERIALITY_RATIO == Decimal("0.05")
    assert AWARD_ADJUSTMENT_ABSOLUTE_USD == Decimal("1000000")
