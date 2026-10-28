from __future__ import annotations

import hashlib
import json
import math
from datetime import date, datetime, time, timezone
from typing import Any, Iterable


MODEL_VERSION = "company-change-indication-v2"
SUPPORTED_ASSESSMENTS = {
    "expansion", "relocation", "growth", "contraction",
    "market_entry", "closure_distress", "formation", "activity",
}
HALF_LIFE_DAYS = 180

# Transparent maximum point contributions. These are deterministic evidence rules,
# not learned probabilities. Procurement and funding are deliberately supporting
# signals and cannot independently establish physical expansion or contraction.
RULES: dict[str, dict[str, tuple[float, str, str]]] = {
    "expansion": {
        "expansion": (30, "physical", "Expansion announcement"),
        "facility_expansion": (30, "physical", "Facility expansion"),
        "new_facility": (26, "physical", "New facility"),
        "commercial_expansion": (24, "physical", "Commercial expansion permit"),
        "commercial_new_construction": (22, "physical", "New-construction permit"),
        "hiring": (18, "workforce", "Hiring increase"),
        "hiring_acceleration": (20, "workforce", "Hiring acceleration"),
        "investment": (18, "corporate", "Capital investment"),
        "market_entry": (16, "market", "New market geography"),
        "award_announced": (8, "procurement", "New federal award"),
        "procurement_acceleration": (8, "procurement", "Federal award acceleration"),
        "funding": (8, "funding", "Official funding signal"),
    },
    "relocation": {
        "relocation": (40, "move", "Relocation announcement"),
        "headquarters_move": (40, "move", "Headquarters move"),
        "registered_address_change": (22, "corporate", "Registered-address change"),
        "origin_closure": (18, "origin_pressure", "Origin facility closure"),
        "destination_permit": (22, "destination_pull", "Destination permit"),
        "destination_hiring": (18, "destination_pull", "Destination hiring"),
        "state_incentive": (18, "destination_pull", "Destination incentive"),
    },
    "growth": {
        "hiring": (20, "workforce", "Hiring activity"),
        "hiring_acceleration": (22, "workforce", "Hiring acceleration"),
        "facility_expansion": (18, "physical", "Facility expansion"),
        "new_facility": (15, "physical", "New facility"),
        "expansion": (18, "physical", "Expansion announcement"),
        "investment": (14, "corporate", "Investment activity"),
        "funding": (12, "funding", "Funding activity"),
        "market_entry": (15, "market", "New market geography"),
        "procurement_acceleration": (14, "procurement", "Federal award acceleration"),
        "award_announced": (6, "procurement", "New federal award"),
        "value_increased": (7, "procurement", "Positive contract modification"),
    },
    "contraction": {
        "closure": (40, "facilities", "Facility closure"),
        "layoff": (28, "workforce", "Layoff"),
        "furlough": (20, "workforce", "Furlough"),
        "bankruptcy": (35, "corporate", "Bankruptcy"),
        "restructuring": (24, "corporate", "Restructuring"),
        "consolidation": (24, "facilities", "Facility consolidation"),
        "hiring_decline": (14, "workforce", "Hiring decline"),
        "procurement_decline": (8, "procurement", "Federal business decline"),
        "value_decreased": (5, "procurement", "Contract deobligation"),
    },
    "market_entry": {
        "market_entry": (35, "market", "Market-entry announcement"),
        "new_facility": (25, "physical", "New facility geography"),
        "destination_permit": (20, "physical", "Permit in new geography"),
        "new_performance_geography": (12, "procurement", "New contract performance geography"),
        "destination_hiring": (18, "workforce", "Hiring in new geography"),
    },
    "closure_distress": {
        "closure": (40, "facilities", "Closure"),
        "layoff": (25, "workforce", "Layoff"),
        "bankruptcy": (35, "corporate", "Bankruptcy"),
        "restructuring": (22, "corporate", "Restructuring"),
        "furlough": (18, "workforce", "Furlough"),
        "procurement_decline": (7, "procurement", "Federal business decline"),
    },
}


def _observed_at(signal: dict[str, Any]) -> datetime:
    value = signal["observed_at"]
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _evidence_key(signal: dict[str, Any]) -> str:
    if signal.get("evidence_key"):
        return str(signal["evidence_key"])
    associated = signal.get("associated_event_ids") or []
    if associated:
        return f"event:{sorted(str(value) for value in associated)[0]}"
    if signal.get("event_id"):
        return f"event:{signal['event_id']}"
    if signal.get("permit_id"):
        return f"permit:{signal['permit_id']}"
    return str(signal.get("indicator_fingerprint") or signal.get("id"))


def indication_band(score: float | None, sufficiency: str) -> str:
    if score is None or sufficiency == "insufficient_history":
        return "insufficient evidence"
    if score >= 70:
        return "strong indication"
    if score >= 40:
        return "moderate indication"
    return "limited indication"


def build_change_assessment(
    company_id: str,
    signals: Iterable[dict[str, Any]],
    *,
    as_of_date: date,
    assessment_type: str,
    country_code: str | None = None,
    state_code: str | None = None,
    county_fips: str | None = None,
    city: str | None = None,
    prediction_horizon_days: int = 180,
) -> dict[str, Any]:
    """Build a point-in-time descriptive score. The result is never a probability."""
    if assessment_type not in SUPPORTED_ASSESSMENTS:
        raise ValueError(f"unsupported assessment type: {assessment_type}")
    if assessment_type == "formation":
        raise ValueError("formation is a geography-industry unit; use build_formation_snapshot")
    rules = RULES.get(assessment_type)
    if not rules:
        rules = {name: rule for group in RULES.values() for name, rule in group.items()}
    cutoff = datetime.combine(as_of_date, time.max, tzinfo=timezone.utc)
    deduplicated: dict[str, dict[str, Any]] = {}
    for signal in signals:
        observed = _observed_at(signal)
        signal_type = str(signal.get("indicator_type") or signal.get("signal_type") or "")
        if observed > cutoff or signal_type not in rules:
            continue
        if country_code and signal.get("country_code") not in (None, country_code):
            continue
        if state_code and signal.get("state_code") not in (None, state_code):
            continue
        if county_fips and signal.get("county_fips") not in (None, county_fips):
            continue
        if city and signal.get("city") not in (None, city):
            continue
        key = _evidence_key(signal)
        current = deduplicated.get(key)
        if current is None or float(signal.get("confidence") or 0) > float(current.get("confidence") or 0):
            deduplicated[key] = signal

    selected = sorted(deduplicated.values(), key=lambda item: (_observed_at(item), _evidence_key(item)))
    components: list[dict[str, Any]] = []
    source_systems: set[str] = set()
    source_families: set[str] = set()
    signal_families: set[str] = set()
    event_ids: list[str] = []
    origin: dict[str, Any] | None = None
    destination: dict[str, Any] | None = None
    for signal in selected:
        signal_type = str(signal.get("indicator_type") or signal.get("signal_type"))
        max_points, family, label = rules[signal_type]
        age_days = max(0, (cutoff - _observed_at(signal)).days)
        decay = math.exp(-math.log(2) * age_days / HALF_LIFE_DAYS)
        points = max_points * float(signal.get("strength") or 0) * float(signal.get("reliability") or 0) * float(signal.get("confidence") or 0) * decay
        source = str(signal.get("source_system") or "unknown")
        source_family = str(signal.get("source_family") or source)
        source_systems.add(source)
        source_families.add(source_family)
        signal_families.add(family)
        if signal.get("event_id"):
            event_ids.append(str(signal["event_id"]))
        geography_role = signal.get("geography_role")
        geography = {
            key: signal.get(key) for key in ("country_code", "state_code", "county_fips", "city") if signal.get(key)
        }
        if geography_role == "origin" and geography:
            origin = geography
        if geography_role == "destination" and geography:
            destination = geography
        if signal.get("origin"):
            origin = {key: value for key, value in dict(signal["origin"]).items() if value}
        if signal.get("destination"):
            destination = {key: value for key, value in dict(signal["destination"]).items() if value}
        components.append({
            "evidence_key": _evidence_key(signal),
            "label": label,
            "indicator_type": signal_type,
            "signal_family": family,
            "source_system": source,
            "source_family": source_family,
            "observed_at": _observed_at(signal).isoformat(),
            "maximum_points": max_points,
            "recency_factor": round(decay, 4),
            "points": round(points, 1),
            "source_url": signal.get("source_url") or (signal.get("evidence") or {}).get("source_url"),
        })

    raw_score = round(sum(item["points"] for item in components), 1)
    independent = len(source_families) >= 2 and len(signal_families) >= 2
    score = min(100.0, raw_score) if components else None
    if score is not None and not independent:
        score = min(69.0, score)
    sufficiency = "sufficient" if independent else "limited" if components else "insufficient_history"
    avg_reliability = (
        sum(float(item.get("reliability") or 0) for item in selected) / len(selected) if selected else 0
    )
    evidence_quality = (
        "insufficient" if not components else "high" if independent and avg_reliability >= 0.85
        else "medium" if avg_reliability >= 0.65 else "low"
    )
    destination_claim = destination if assessment_type == "relocation" and origin and destination else None
    signature = [{"key": item["evidence_key"], "observed_at": item["observed_at"]} for item in components]
    payload = {
        "company_id": company_id, "assessment_type": assessment_type, "as_of_date": as_of_date.isoformat(),
        "model_version": MODEL_VERSION, "geography": [country_code, state_code, county_fips, city], "evidence": signature,
    }
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    explanation = (
        f"Descriptive {assessment_type} indication from {len(components)} deduplicated signals across "
        f"{len(source_families)} independent source families. Points apply published evidence caps, reliability, "
        "strength, confidence, and 180-day time decay; this is not a probability."
        if components else "No qualifying point-in-time evidence was observed by the assessment cutoff."
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
        "data_sufficiency": sufficiency,
        "model_version": MODEL_VERSION,
        "components": {
            "score_kind": "descriptive_indication_not_probability",
            "band": indication_band(score, sufficiency),
            "source_system_count": len(source_systems),
            "independent_source_count": len(source_families),
            "signal_family_count": len(signal_families),
            "half_life_days": HALF_LIFE_DAYS,
            "origin": origin,
            "destination": destination_claim,
            "destination_claim_supported": destination_claim is not None,
            "items": components,
        },
        "evidence_event_ids": sorted(set(event_ids)),
        "explanation": explanation,
    }


def material_indication_change(previous: float | None, current: float | None) -> bool:
    """Alert only for a >=15 point move or a crossing into the 40/70 bands."""
    if previous is None or current is None or current <= previous:
        return False
    return current - previous >= 15 or any(previous < threshold <= current for threshold in (40, 70))
