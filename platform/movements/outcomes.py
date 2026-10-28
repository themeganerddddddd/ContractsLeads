from __future__ import annotations

import hashlib
from datetime import date, datetime
from typing import Any, Iterable


EVENT_OUTCOMES = {
    "expansion": ("expansion", "company-expansion-v1"),
    "facility_expansion": ("expansion", "company-expansion-v1"),
    "new_facility": ("new_facility", "company-expansion-v1"),
    "opening": ("new_facility", "company-expansion-v1"),
    "market_entry": ("market_entry", "company-expansion-v1"),
    "layoff": ("contraction", "company-contraction-v1"),
    "furlough": ("contraction", "company-contraction-v1"),
    "consolidation": ("contraction", "company-contraction-v1"),
    "bankruptcy": ("contraction", "company-contraction-v1"),
    "restructuring": ("contraction", "company-contraction-v1"),
    "closure": ("closure", "company-contraction-v1"),
}


def _day(value: Any) -> date | None:
    if value is None or isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    return date.fromisoformat(str(value)[:10])


def _location(locations: Iterable[dict[str, Any]], role: str) -> dict[str, Any] | None:
    return next((item for item in locations if item.get("location_role") == role), None)


def event_outcome(event: dict[str, Any]) -> dict[str, Any] | None:
    """Return a qualifying observed outcome or None; procurement events are never accepted."""
    event_type = str(event.get("event_type") or "")
    if event.get("review_status") not in {"auto_verified", "approved"}:
        return None
    if event.get("verification_status") not in {"source_verified", "corroborated"}:
        return None
    if not event.get("company_id") or not event.get("source_url"):
        return None
    outcome_date = _day(event.get("effective_start_date") or event.get("event_date") or event.get("announced_date"))
    if not outcome_date:
        return None
    locations = list(event.get("locations") or [])
    origin = destination = None
    if event_type in {"relocation", "headquarters_move"}:
        origin = _location(locations, "origin")
        destination = _location(locations, "destination") or _location(locations, "headquarters")
        if not origin or not destination:
            return None
        outcome_type, definition = "relocation", "company-relocation-v1"
    elif event_type in EVENT_OUTCOMES:
        outcome_type, definition = EVENT_OUTCOMES[event_type]
    else:
        return None
    fingerprint = hashlib.sha256(
        f"{definition}|{event['company_id']}|{event.get('event_id')}|{outcome_type}|{outcome_date.isoformat()}".encode()
    ).hexdigest()
    destination = destination or (_location(locations, "destination") if locations else None)
    primary = destination or _location(locations, "new_facility") or _location(locations, "expanded_facility") or {}
    return {
        "outcome_fingerprint": fingerprint,
        "company_id": event["company_id"],
        "definition_version": definition,
        "outcome_type": outcome_type,
        "outcome_date": outcome_date,
        "announcement_date": _day(event.get("announced_date")),
        "country_code": primary.get("country_code") or event.get("source_country"),
        "state_code": primary.get("state_code") or event.get("primary_state"),
        "county_fips": primary.get("county_fips") or event.get("primary_county_fips"),
        "city": primary.get("city") or event.get("primary_city"),
        "origin_country": origin.get("country_code") if origin else None,
        "origin_state": origin.get("state_code") if origin else None,
        "origin_county_fips": origin.get("county_fips") if origin else None,
        "origin_city": origin.get("city") if origin else None,
        "destination_country": destination.get("country_code") if destination else None,
        "destination_state": destination.get("state_code") if destination else None,
        "destination_county_fips": destination.get("county_fips") if destination else None,
        "destination_city": destination.get("city") if destination else None,
        "jobs_created": event.get("jobs_created"),
        "jobs_lost": event.get("jobs_affected") if outcome_type in {"contraction", "closure"} else None,
        "capital_investment": event.get("capital_investment"),
        "currency": event.get("currency"),
        "square_feet": event.get("square_feet"),
        "source_system": event["source_system"],
        "source_url": event["source_url"],
        "source_event_id": event.get("event_id"),
        "registration_id": None,
        "verification_status": event["verification_status"],
        "evidence": {"event_type": event_type, "event_title": event.get("title")},
        "first_observed_at": event["first_observed_at"],
    }


def registration_outcome(registration: dict[str, Any]) -> dict[str, Any] | None:
    formation_date = _day(registration.get("formation_date") or registration.get("registration_date"))
    if not formation_date or not registration.get("source_url"):
        return None
    if registration.get("resolution_status") not in {"unresolved", "candidate", "auto_verified", "approved"}:
        return None
    fingerprint = hashlib.sha256(
        f"business-formation-v1|{registration['source_system']}|{registration['official_identifier']}|{formation_date}".encode()
    ).hexdigest()
    return {
        "outcome_fingerprint": fingerprint,
        "company_id": registration.get("company_id"),
        "definition_version": "business-formation-v1",
        "outcome_type": "formation",
        "outcome_date": formation_date,
        "announcement_date": None,
        "country_code": registration.get("country_code"),
        "state_code": registration.get("state_code"),
        "county_fips": registration.get("county_fips"),
        "city": registration.get("city"),
        "origin_country": None, "origin_state": None, "origin_county_fips": None, "origin_city": None,
        "destination_country": None, "destination_state": None, "destination_county_fips": None, "destination_city": None,
        "jobs_created": None, "jobs_lost": None, "capital_investment": None, "currency": None, "square_feet": None,
        "source_system": registration["source_system"],
        "source_url": registration["source_url"],
        "source_event_id": None,
        "registration_id": registration.get("id"),
        "verification_status": "approved" if registration.get("resolution_status") == "approved" else "source_verified",
        "evidence": {"official_identifier": registration["official_identifier"], "legal_name": registration["legal_name"]},
        "first_observed_at": registration["first_observed_at"],
    }


def validate_outcomes(outcomes: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = list(outcomes)
    invalid_source = [row for row in rows if not row.get("source_url") or not row.get("source_system")]
    invalid_relocations = [row for row in rows if row.get("outcome_type") == "relocation" and not (
        (row.get("origin_country") or row.get("origin_state") or row.get("origin_county_fips") or row.get("origin_city"))
        and (row.get("destination_country") or row.get("destination_state") or row.get("destination_county_fips") or row.get("destination_city"))
    )]
    invalid_companies = [row for row in rows if not row.get("company_id") and row.get("outcome_type") != "formation"]
    return {
        "total": len(rows),
        "invalid_source": len(invalid_source),
        "invalid_relocation_geography": len(invalid_relocations),
        "invalid_company_unit": len(invalid_companies),
        "valid": not (invalid_source or invalid_relocations or invalid_companies),
    }
