from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Any


MODEL_VERSION = "business-formation-activity-v1"


def build_formation_snapshot(
    *,
    as_of_month: date,
    country_code: str,
    industry_code: str,
    observations: dict[str, Any],
    state_code: str | None = None,
    county_fips: str | None = None,
    industry_label: str | None = None,
) -> dict[str, Any]:
    """Create a descriptive geography-industry activity score, never a probability."""
    if as_of_month.day != 1:
        raise ValueError("as_of_month must be the first day of a month")
    registrations = observations.get("new_registrations")
    coverage = dict(observations.get("coverage") or {})
    if registrations is None:
        score = level = None
        sufficiency = "insufficient_history"
        components: list[dict[str, Any]] = []
    else:
        registrations = max(0, int(registrations))
        previous = observations.get("previous_year_registrations")
        rolling = observations.get("rolling_average_registrations")
        components = [{"label": "New official registrations", "value": registrations, "points": min(45.0, registrations * 1.5)}]
        if previous not in (None, 0):
            growth = (registrations - float(previous)) / float(previous)
            components.append({"label": "Year-over-year registration change", "value": round(growth, 4), "points": max(0.0, min(25.0, growth * 25))})
        if rolling not in (None, 0):
            lift = (registrations - float(rolling)) / float(rolling)
            components.append({"label": "Lift over rolling average", "value": round(lift, 4), "points": max(0.0, min(20.0, lift * 20))})
        permit_growth = observations.get("commercial_permit_growth")
        if permit_growth is not None:
            components.append({"label": "Commercial permit growth", "value": permit_growth, "points": max(0.0, min(10.0, float(permit_growth) * 10))})
        score = round(min(100.0, sum(float(item["points"]) for item in components)), 1)
        level = "high" if score >= 70 else "moderate" if score >= 40 else "low"
        sufficiency = "sufficient" if previous is not None and rolling is not None else "limited"
    signature = json.dumps({
        "month": as_of_month.isoformat(), "country": country_code, "state": state_code,
        "county": county_fips, "industry": industry_code, "model": MODEL_VERSION,
    }, sort_keys=True)
    return {
        "snapshot_fingerprint": hashlib.sha256(signature.encode()).hexdigest(),
        "as_of_month": as_of_month,
        "country_code": country_code,
        "state_code": state_code,
        "county_fips": county_fips,
        "industry_code": industry_code,
        "industry_label": industry_label,
        "new_registrations": registrations,
        "active_registrations": observations.get("active_registrations"),
        "closures_dissolutions": observations.get("closures_dissolutions"),
        "commercial_permits": observations.get("commercial_permits"),
        "new_construction_permits": observations.get("new_construction_permits"),
        "tenant_improvement_permits": observations.get("tenant_improvement_permits"),
        "job_posting_volume": observations.get("job_posting_volume"),
        "sbir_sttr_awards": observations.get("sbir_sttr_awards"),
        "nih_grants": observations.get("nih_grants"),
        "federal_awards": observations.get("federal_awards"),
        "state_incentives": observations.get("state_incentives"),
        "employment": observations.get("employment"),
        "average_wage": observations.get("average_wage"),
        "establishment_count": observations.get("establishment_count"),
        "formation_score": score,
        "activity_level": level,
        "data_sufficiency": sufficiency,
        "model_version": MODEL_VERSION,
        "components": {"score_kind": "formation_activity_not_probability", "items": components},
        "coverage": coverage,
    }
