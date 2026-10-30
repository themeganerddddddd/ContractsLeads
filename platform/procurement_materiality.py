from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any


AWARD_ADJUSTMENT_MATERIALITY_RATIO = Decimal("0.05")
AWARD_ADJUSTMENT_ABSOLUTE_USD = Decimal("1000000")


@dataclass(frozen=True)
class AdjustmentMateriality:
    status: str
    percent: Decimal | None
    relative_material: bool
    absolute_material: bool


def _decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return parsed if parsed.is_finite() else None


def best_reference_award_value(*values: Any) -> Decimal | None:
    """Return the first positive/non-zero absolute award value in source hierarchy order."""
    for value in values:
        parsed = _decimal(value)
        if parsed is not None and parsed != 0:
            return abs(parsed)
    return None


def evaluate_award_adjustment(
    adjustment: Any,
    reference_award_value: Any = None,
    currency: str | None = None,
    *,
    adjustment_usd: Any = None,
) -> AdjustmentMateriality:
    """Classify presentation materiality without changing transaction accounting.

    Native-currency relative comparisons are valid because numerator and
    denominator share a currency. The absolute threshold is applied only to USD
    or to an explicitly supplied reliable USD conversion.
    """
    delta = _decimal(adjustment)
    if delta is None:
        return AdjustmentMateriality("unknown", None, False, False)

    absolute_delta = abs(delta)
    reference = best_reference_award_value(reference_award_value)
    percent = absolute_delta / reference * Decimal("100") if reference is not None else None
    relative_material = percent is not None and percent / Decimal("100") >= AWARD_ADJUSTMENT_MATERIALITY_RATIO

    converted = _decimal(adjustment_usd)
    usd_delta = abs(converted) if converted is not None else absolute_delta if str(currency or "").upper() == "USD" else None
    absolute_material = usd_delta is not None and usd_delta >= AWARD_ADJUSTMENT_ABSOLUTE_USD

    if relative_material or absolute_material:
        return AdjustmentMateriality("material", percent, relative_material, absolute_material)
    if absolute_delta == 0 or reference is not None:
        return AdjustmentMateriality("immaterial", percent, False, False)
    return AdjustmentMateriality("unknown", None, False, False)
