from __future__ import annotations

import hashlib
import json
import math
from datetime import date, datetime, time, timezone
from typing import Any, Iterable


MODEL_VERSION = "business-change-indication-v1"
HALF_LIFE_DAYS = 180

CATEGORY_EVENT_TYPES: dict[str, tuple[str, ...]] = {
    "opening": ("location_planned", "location_opening", "location_opened", "market_entry"),
    "growing": ("location_expansion", "workforce_expansion", "company_growth", "facility_acquisition"),
    "moving": ("relocation_planned", "relocation_completed"),
    "closing": ("closure_announced", "location_closed", "facility_disposition"),
    "shrinking": ("workforce_contraction", "location_contraction"),
    "new-businesses": ("business_formed",),
}

# Maximum contributions are published, deterministic evidence weights. They are
# descriptive points, not learned probabilities. A license, permit, registration,
# WARN notice, or procurement record is intentionally unable to establish a
# physical outcome by itself.
RULES: dict[str, dict[str, tuple[float, str, str]]] = {
    "opening": {
        "opening_announcement": (42, "economic_development", "Official opening announcement"),
        "location_planned": (32, "economic_development", "Planned location announcement"),
        "new_business_license": (18, "licenses", "New business license"),
        "certificate_of_occupancy": (28, "facilities_permits", "Certificate of occupancy"),
        "new_construction_permit": (20, "facilities_permits", "New-construction permit"),
        "tenant_improvement_permit": (16, "facilities_permits", "Tenant-improvement permit"),
        "new_hiring_geography": (18, "workforce", "Hiring in a new geography"),
        "market_entry": (26, "economic_development", "Market-entry announcement"),
        "new_contract_geography": (6, "government_business", "New contract-performance geography"),
    },
    "growth": {
        "expansion_announcement": (36, "economic_development", "Official expansion announcement"),
        "facility_expansion": (30, "facilities_permits", "Facility expansion"),
        "workforce_expansion": (28, "workforce", "Workforce expansion"),
        "hiring_acceleration": (20, "workforce", "Hiring acceleration"),
        "capital_investment": (20, "corporate_capital", "Capital investment"),
        "tenant_improvement_permit": (16, "facilities_permits", "Tenant-improvement permit"),
        "new_construction_permit": (20, "facilities_permits", "New-construction permit"),
        "new_government_award": (7, "government_business", "New government award"),
        "procurement_growth": (9, "government_business", "Government-business growth"),
    },
    "relocation": {
        "relocation_announcement": (45, "economic_development", "Relocation announcement"),
        "registered_address_change": (18, "registration", "Registered-address change"),
        "origin_closure": (18, "facilities_permits", "Origin-location closure"),
        "destination_license": (16, "licenses", "Destination business license"),
        "destination_permit": (18, "facilities_permits", "Destination permit"),
        "destination_hiring": (16, "workforce", "Destination hiring"),
        "relocation_incentive": (20, "economic_development", "Relocation incentive"),
    },
    "closing": {
        "closure_announcement": (48, "economic_development", "Official closure announcement"),
        "location_closed": (48, "facilities_permits", "Location closure"),
        "license_termination": (24, "licenses", "License termination"),
        "warn_site_closure": (26, "workforce", "WARN tied to site closure"),
        "warn_layoff": (16, "workforce", "WARN workforce reduction"),
        "facility_disposition": (18, "property", "Facility disposition"),
        "business_dissolution": (24, "registration", "Business dissolution"),
        "procurement_decline": (5, "government_business", "Government-business decline"),
    },
    "contraction": {
        "warn_layoff": (30, "workforce", "WARN workforce reduction"),
        "warn_site_closure": (34, "workforce", "WARN tied to site closure"),
        "location_contraction": (34, "facilities_permits", "Location contraction"),
        "facility_disposition": (20, "property", "Facility disposition"),
        "hiring_decline": (14, "workforce", "Hiring decline"),
        "restructuring": (22, "corporate_capital", "Restructuring"),
        "bankruptcy": (24, "corporate_capital", "Bankruptcy"),
        "contract_loss": (6, "government_business", "Contract loss"),
        "deobligation": (4, "government_business", "Contract deobligation"),
    },
}

GEOGRAPHY_FACTORS = {
    "exact_address": 1.0,
    "postal_code": 0.95,
    "city": 0.90,
    "county": 0.75,
    "state": 0.50,
    "unknown": 0.30,
}


def _observed_at(signal: dict[str, Any]) -> datetime:
    value = signal["observed_at"]
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _evidence_key(signal: dict[str, Any]) -> str:
    if signal.get("evidence_group_id"):
        return f"group:{signal['evidence_group_id']}"
    if signal.get("source_event_id"):
        return f"source:{signal.get('source_system')}:{signal['source_event_id']}"
    if signal.get("content_hash"):
        return f"content:{signal.get('source_system')}:{signal['content_hash']}"
    return str(signal.get("signal_fingerprint") or signal.get("id"))


def deduplicate_signals(signals: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return one strongest observation for each real-world evidence group."""
    grouped: dict[str, dict[str, Any]] = {}
    for signal in signals:
        key = _evidence_key(signal)
        current = grouped.get(key)
        rank = (
            float(signal.get("confidence") or 0),
            float(signal.get("reliability") or 0),
            _observed_at(signal),
        )
        if current is None or rank > (
            float(current.get("confidence") or 0),
            float(current.get("reliability") or 0),
            _observed_at(current),
        ):
            grouped[key] = signal
    return sorted(grouped.values(), key=lambda item: (_observed_at(item), _evidence_key(item)))


def indication_band(score: float | None, data_sufficiency: str) -> str:
    if score is None or data_sufficiency == "insufficient_history":
        return "insufficient_evidence"
    if score >= 70:
        return "strong"
    if score >= 40:
        return "moderate"
    return "early"


def calculate_lead_time(first_indication_at: datetime | date | None, outcome_date: date | None) -> int | None:
    if first_indication_at is None or outcome_date is None:
        return None
    indication_date = first_indication_at.date() if isinstance(first_indication_at, datetime) else first_indication_at
    days = (outcome_date - indication_date).days
    return days if days >= 0 else None


def build_business_change_assessment(
    *,
    unit_type: str,
    assessment_type: str,
    signals: Iterable[dict[str, Any]],
    as_of_date: date,
    company_id: str | None = None,
    establishment_id: str | None = None,
    country_code: str | None = None,
    state_code: str | None = None,
    county_fips: str | None = None,
    city: str | None = None,
    postal_code: str | None = None,
) -> dict[str, Any]:
    """Build a point-in-time indication for a company, establishment, or geography."""
    if assessment_type not in RULES:
        raise ValueError(f"unsupported assessment type: {assessment_type}")
    if unit_type not in {"company", "establishment", "location"}:
        raise ValueError(f"unsupported unit type: {unit_type}")
    if unit_type == "company" and not company_id:
        raise ValueError("company assessments require company_id")
    if unit_type == "establishment" and not establishment_id:
        raise ValueError("establishment assessments require establishment_id")
    if unit_type == "location" and not country_code:
        raise ValueError("location assessments require country_code")

    cutoff = datetime.combine(as_of_date, time.max, tzinfo=timezone.utc)
    qualifying = [
        signal for signal in signals
        if _observed_at(signal) <= cutoff and str(signal.get("signal_type") or "") in RULES[assessment_type]
    ]
    selected = deduplicate_signals(qualifying)
    components: list[dict[str, Any]] = []
    source_systems: set[str] = set()
    signal_families: set[str] = set()
    origin: dict[str, Any] | None = None
    destination: dict[str, Any] | None = None

    for signal in selected:
        signal_type = str(signal["signal_type"])
        maximum, family, label = RULES[assessment_type][signal_type]
        age_days = max(0, (cutoff - _observed_at(signal)).days)
        recency_factor = math.exp(-math.log(2) * age_days / HALF_LIFE_DAYS)
        precision = str(signal.get("location_precision") or "unknown")
        geography_factor = GEOGRAPHY_FACTORS.get(precision, GEOGRAPHY_FACTORS["unknown"])
        points = (
            maximum
            * float(signal.get("strength") or 0)
            * float(signal.get("reliability") or 0)
            * float(signal.get("confidence") or 0)
            * recency_factor
            * geography_factor
        )
        source = str(signal.get("source_system") or "unknown")
        source_systems.add(source)
        signal_families.add(family)
        if signal.get("origin"):
            origin = {key: value for key, value in dict(signal["origin"]).items() if value}
        if signal.get("destination"):
            destination = {key: value for key, value in dict(signal["destination"]).items() if value}
        components.append({
            "evidence_key": _evidence_key(signal),
            "signal_type": signal_type,
            "signal_family": family,
            "label": label,
            "source_system": source,
            "source_url": signal.get("source_url"),
            "observed_at": _observed_at(signal).isoformat(),
            "location_precision": precision,
            "maximum_points": maximum,
            "recency_factor": round(recency_factor, 4),
            "geography_factor": geography_factor,
            "points": round(points, 1),
        })

    independent = len(source_systems) >= 2 and len(signal_families) >= 2
    score = min(100.0, round(sum(item["points"] for item in components), 1)) if components else None
    if score is not None and not independent:
        score = min(69.0, score)
    destination_supported = assessment_type != "relocation" or bool(origin and destination)
    if score is not None and assessment_type == "relocation" and not destination_supported:
        score = min(69.0, score)
    data_sufficiency = "sufficient" if independent else "limited" if components else "insufficient_history"
    avg_reliability = sum(float(row.get("reliability") or 0) for row in selected) / len(selected) if selected else 0
    evidence_quality = (
        "insufficient" if not components else "high" if independent and avg_reliability >= 0.85
        else "medium" if avg_reliability >= 0.65 else "low"
    )
    band = indication_band(score, data_sufficiency)
    identity = company_id or establishment_id or "|".join(filter(None, [country_code, state_code, county_fips, city, postal_code]))
    payload = {
        "unit_type": unit_type,
        "identity": identity,
        "assessment_type": assessment_type,
        "as_of_date": as_of_date.isoformat(),
        "model_version": MODEL_VERSION,
        "evidence": [_evidence_key(signal) for signal in selected],
    }
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    explanation = (
        f"{band.replace('_', ' ').title()} {assessment_type} indication from {len(components)} deduplicated "
        f"signals across {len(source_systems)} source systems and {len(signal_families)} evidence families. "
        "Published caps, reliability, strength, confidence, recency, and geography specificity determine the score; "
        "it is not a probability."
        if components else "No qualifying point-in-time evidence was observed by the assessment cutoff."
    )
    return {
        "assessment_fingerprint": fingerprint,
        "unit_type": unit_type,
        "company_id": company_id,
        "establishment_id": establishment_id,
        "country_code": country_code,
        "state_code": state_code,
        "county_fips": county_fips,
        "city": city,
        "postal_code": postal_code,
        "assessment_type": assessment_type,
        "as_of_date": as_of_date,
        "score": score,
        "band": band,
        "evidence_quality": evidence_quality,
        "data_sufficiency": data_sufficiency,
        "model_version": MODEL_VERSION,
        "components": {
            "score_kind": "descriptive_indication_not_probability",
            "source_system_count": len(source_systems),
            "signal_family_count": len(signal_families),
            "independent_evidence": independent,
            "origin": origin,
            "destination": destination if destination_supported else None,
            "destination_claim_supported": destination_supported,
            "half_life_days": HALF_LIFE_DAYS,
            "items": components,
        },
        "explanation": explanation,
    }
