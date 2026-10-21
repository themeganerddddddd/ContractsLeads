from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Iterable


NEW_AWARD_FEATURES = (
    "events_90d", "events_365d", "awards_365d", "changes_365d", "positive_value_changes_365d",
    "buyer_count_365d", "days_since_last_event", "history_days",
)
CONTRACT_CHANGE_FEATURES = (
    "events_90d", "changes_180d", "value_changes_180d", "options_365d",
    "days_since_last_event", "days_to_contract_end", "history_days",
)


def _as_datetime(value: date | datetime | str) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _number(value: object) -> float:
    if value is None:
        return 0.0
    return float(Decimal(str(value)))


def events_at_or_before(events: Iterable[dict[str, Any]], as_of: date | datetime) -> list[dict[str, Any]]:
    cutoff = _as_datetime(as_of)
    return sorted(
        (event for event in events if _as_datetime(event["event_at"]) <= cutoff),
        key=lambda event: _as_datetime(event["event_at"]),
    )


def build_feature_snapshot(
    events: Iterable[dict[str, Any]],
    as_of: date | datetime,
    prediction_type: str,
    *,
    contract_end_date: date | datetime | None = None,
) -> dict[str, float]:
    """Create a feature vector using only observations available at ``as_of``."""
    cutoff = _as_datetime(as_of)
    history = events_at_or_before(events, cutoff)

    def within(days: int) -> list[dict[str, Any]]:
        return [event for event in history if 0 <= (cutoff - _as_datetime(event["event_at"])).days <= days]

    last_event = _as_datetime(history[-1]["event_at"]) if history else None
    first_event = _as_datetime(history[0]["event_at"]) if history else None
    events_90 = within(90)
    events_180 = within(180)
    events_365 = within(365)
    base = {
        "events_90d": float(len(events_90)),
        "days_since_last_event": float((cutoff - last_event).days if last_event else 9999),
        "history_days": float((cutoff - first_event).days if first_event else 0),
    }
    if prediction_type == "new_award":
        base.update({
            "events_365d": float(len(events_365)),
            "awards_365d": float(sum(event.get("event_type") == "award_announced" for event in events_365)),
            "changes_365d": float(sum(event.get("event_type") == "contract_modified" for event in events_365)),
            "positive_value_changes_365d": float(sum(
                _number(event.get("value_delta_native")) > 0 for event in events_365
            )),
            "buyer_count_365d": float(len({event.get("buyer_id") for event in events_365 if event.get("buyer_id")})),
        })
        return {name: base[name] for name in NEW_AWARD_FEATURES}
    if prediction_type in {"contract_change", "renewal_recompete"}:
        end = _as_datetime(contract_end_date) if contract_end_date else None
        base.update({
            "changes_180d": float(sum(event.get("event_type") == "contract_modified" for event in events_180)),
            "value_changes_180d": float(sum(
                event.get("event_type") in {"value_increased", "value_decreased"} for event in events_180
            )),
            "options_365d": float(sum(event.get("event_type") == "option_exercised" for event in events_365)),
            "days_to_contract_end": float((end - cutoff).days if end else 9999),
        })
        return {name: base[name] for name in CONTRACT_CHANGE_FEATURES}
    raise ValueError(f"unsupported prediction type: {prediction_type}")


def feature_reasons(snapshot: dict[str, float]) -> list[str]:
    ranked = sorted(snapshot.items(), key=lambda item: abs(item[1]), reverse=True)
    labels = {
        "events_90d": "recent government activity",
        "events_365d": "annual government activity",
        "awards_365d": "recent award cadence",
        "changes_365d": "recent contract changes",
        "positive_value_changes_365d": "recent positive value changes",
        "buyer_count_365d": "buyer diversification",
        "days_since_last_event": "time since the last observed event",
        "history_days": "observable history length",
        "changes_180d": "recent modification cadence",
        "value_changes_180d": "recent value-change cadence",
        "options_365d": "recent option exercises",
        "days_to_contract_end": "time remaining on the contract",
    }
    return [f"{labels.get(name, name)}: {value:g}" for name, value in ranked[:3]]


def momentum_snapshot(events: Iterable[dict[str, Any]], as_of: date | datetime) -> dict[str, Any]:
    cutoff = _as_datetime(as_of)
    history = events_at_or_before(events, cutoff)
    if not history or (cutoff - _as_datetime(history[0]["event_at"])).days < 90 or len(history) < 3:
        return {
            "score": None,
            "data_sufficiency": "insufficient_history",
            "components": {},
            "explanation": "Insufficient history: at least 90 days and three observed events are required.",
        }
    recent = [event for event in history if (cutoff - _as_datetime(event["event_at"])).days <= 180]
    prior = [event for event in history if 180 < (cutoff - _as_datetime(event["event_at"])).days <= 365]
    recency = max(0.0, 25.0 - min(25.0, (cutoff - _as_datetime(history[-1]["event_at"])).days / 7))
    volume = min(25.0, len(recent) * 2.5)
    modifications = min(20.0, sum(event.get("event_type") in {"contract_modified", "option_exercised"} for event in recent) * 4.0)
    buyers = min(15.0, len({event.get("buyer_id") for event in recent if event.get("buyer_id")}) * 5.0)
    recent_positive = sum(max(0.0, _number(event.get("value_delta_native"))) for event in recent)
    prior_positive = sum(max(0.0, _number(event.get("value_delta_native"))) for event in prior)
    value_trend = 15.0 if recent_positive > prior_positive and recent_positive > 0 else 7.5 if recent_positive else 0.0
    components = {
        "recency": round(recency, 2),
        "recent_volume": round(volume, 2),
        "contract_activity": round(modifications, 2),
        "buyer_diversification": round(buyers, 2),
        "positive_value_trend": round(value_trend, 2),
    }
    score = min(100, max(0, round(sum(components.values()))))
    return {
        "score": score,
        "data_sufficiency": "sufficient",
        "components": components,
        "explanation": "Activity index from recency, volume, contract actions, buyer breadth, and positive value trend; it is not a probability.",
    }
