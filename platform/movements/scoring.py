from __future__ import annotations

import hashlib
import json
import math
from datetime import date, datetime, time, timezone
from typing import Any, Iterable


MODEL_VERSION = "movement-indication-v1"
HALF_LIFE_DAYS = 180


def _observed_at(indicator: dict[str, Any]) -> datetime:
    value = indicator["observed_at"]
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _evidence_key(indicator: dict[str, Any]) -> str:
    associated = indicator.get("associated_event_ids") or []
    if associated:
        return f"event:{sorted(str(value) for value in associated)[0]}"
    if indicator.get("permit_id"):
        return f"permit:{indicator['permit_id']}"
    return str(indicator.get("indicator_fingerprint") or indicator.get("id"))


def build_movement_assessment(
    company_id: str,
    indicators: Iterable[dict[str, Any]],
    *,
    as_of_date: date,
    assessment_type: str,
    country_code: str | None = None,
    state_code: str | None = None,
    county_fips: str | None = None,
    city: str | None = None,
    prediction_horizon_days: int = 180,
) -> dict[str, Any]:
    """Build an auditable descriptive score using only evidence observed by as_of_date."""
    cutoff = datetime.combine(as_of_date, time.max, tzinfo=timezone.utc)
    desired_direction = {
        "growth": "positive",
        "contraction": "negative",
        "relocation": None,
        "market_entry": "positive",
        "activity": None,
    }.get(assessment_type)
    if assessment_type not in {"growth", "contraction", "relocation", "market_entry", "activity"}:
        raise ValueError(f"unsupported assessment type: {assessment_type}")
    deduplicated: dict[str, dict[str, Any]] = {}
    for indicator in indicators:
        observed = _observed_at(indicator)
        if observed > cutoff:
            continue
        if country_code and indicator.get("country_code") not in (None, country_code):
            continue
        if state_code and indicator.get("state_code") not in (None, state_code):
            continue
        if county_fips and indicator.get("county_fips") not in (None, county_fips):
            continue
        if city and indicator.get("city") not in (None, city):
            continue
        if desired_direction and indicator.get("direction") != desired_direction:
            continue
        key = _evidence_key(indicator)
        current = deduplicated.get(key)
        if current is None or float(indicator.get("confidence") or 0) > float(current.get("confidence") or 0):
            deduplicated[key] = indicator
    selected = sorted(deduplicated.values(), key=lambda item: (_observed_at(item), str(item.get("id") or "")))
    sources = {str(item.get("source_system")) for item in selected if item.get("source_system")}
    types = {str(item.get("indicator_type")) for item in selected if item.get("indicator_type")}
    sufficient = len(selected) >= 2 and len(sources) >= 2 and len(types) >= 2
    weights: list[float] = []
    for indicator in selected:
        age_days = max(0, (cutoff - _observed_at(indicator)).days)
        decay = math.exp(-math.log(2) * age_days / HALF_LIFE_DAYS)
        weight = (
            float(indicator.get("strength") or 0)
            * float(indicator.get("reliability") or 0)
            * float(indicator.get("confidence") or 0)
            * decay
        )
        weights.append(weight)
    score = round(100 * (1 - math.exp(-sum(weights))), 1) if sufficient else None
    average_reliability = sum(float(item.get("reliability") or 0) for item in selected) / len(selected) if selected else 0
    evidence_quality = (
        "insufficient" if not sufficient else "high" if average_reliability >= 0.85 else "medium" if average_reliability >= 0.65 else "low"
    )
    data_sufficiency = "sufficient" if sufficient else "limited" if selected else "insufficient_history"
    evidence_ids = [str(item.get("event_id")) for item in selected if item.get("event_id")]
    evidence_signature = [
        {
            "key": _evidence_key(item),
            "observed_at": _observed_at(item).isoformat(),
            "source_system": item.get("source_system"),
            "indicator_type": item.get("indicator_type"),
        }
        for item in selected
    ]
    fingerprint_payload = json.dumps(
        {
            "company_id": company_id,
            "assessment_type": assessment_type,
            "as_of_date": as_of_date.isoformat(),
            "model_version": MODEL_VERSION,
            "geography": [country_code, state_code, county_fips, city],
            "evidence": evidence_signature,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    fingerprint = hashlib.sha256(fingerprint_payload.encode("utf-8")).hexdigest()
    explanation = (
        f"Descriptive {assessment_type} indication from {len(selected)} deduplicated indicators across "
        f"{len(sources)} source systems; weights combine source reliability, signal strength, confidence, and time decay."
        if sufficient
        else "Insufficient independent evidence: at least two indicator types from two source systems are required before displaying a score."
    )
    return {
        "assessment_fingerprint": fingerprint,
        "company_id": company_id,
        "assessment_type": assessment_type,
        "as_of_date": as_of_date,
        "prediction_horizon_days": prediction_horizon_days,
        "country_code": country_code,
        "state_code": state_code,
        "county_fips": county_fips,
        "city": city,
        "score": score,
        "evidence_quality": evidence_quality,
        "data_sufficiency": data_sufficiency,
        "model_version": MODEL_VERSION,
        "components": {
            "indicator_count": len(selected),
            "source_count": len(sources),
            "indicator_type_count": len(types),
            "weighted_evidence": round(sum(weights), 6),
            "half_life_days": HALF_LIFE_DAYS,
            "evidence": evidence_signature,
        },
        "evidence_event_ids": evidence_ids,
        "explanation": explanation,
    }
