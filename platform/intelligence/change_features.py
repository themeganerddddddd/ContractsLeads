from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, time, timezone
from typing import Any, Iterable


def _datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def build_company_feature_snapshot(
    company_id: str,
    records: Iterable[dict[str, Any]],
    *,
    as_of_date: date,
    model_type: str,
    formation_date: date | None = None,
) -> dict[str, Any]:
    """Build a company feature vector strictly from facts observable by the cutoff."""
    if model_type not in {"company_expansion", "company_relocation", "company_growth", "company_contraction"}:
        raise ValueError(f"unsupported company feature model: {model_type}")
    cutoff = datetime.combine(as_of_date, time.max, tzinfo=timezone.utc)
    selected = []
    source_times: dict[str, str] = {}
    for record in records:
        observed = _datetime(record.get("observed_at") or record.get("event_at"))
        occurred = _datetime(record.get("event_at") or record.get("observed_at"))
        if observed > cutoff or occurred > cutoff:
            continue
        if formation_date and occurred.date() < formation_date:
            continue
        selected.append({**record, "_observed": observed, "_occurred": occurred})
        source = str(record.get("source_system") or "unknown")
        source_times[source] = max(source_times.get(source, ""), observed.isoformat())

    def recent(days: int) -> list[dict[str, Any]]:
        return [row for row in selected if (cutoff - row["_occurred"]).days <= days]

    event_types = lambda rows, names: sum(str(row.get("event_type") or row.get("indicator_type")) in names for row in rows)
    procurement_types = {"award_announced", "contract_signed", "contract_modified", "value_increased", "value_decreased", "option_exercised"}
    facilities_open = {"new_facility", "facility_expansion", "opening", "expansion"}
    facilities_closed = {"closure", "consolidation"}
    workforce_positive = {"hiring", "hiring_acceleration"}
    workforce_negative = {"layoff", "furlough", "hiring_decline"}
    values: dict[str, float] = {}
    for days in (30, 90, 365):
        rows = recent(days)
        contract_rows = [row for row in rows if str(row.get("event_type")) in procurement_types]
        values[f"contracts_{days}d"] = float(len(contract_rows))
        values[f"contract_value_change_{days}d"] = sum(float(row.get("value_delta_native") or 0) for row in contract_rows)
        values[f"job_postings_{days}d"] = sum(float(row.get("posting_count") or row.get("new_postings") or 0) for row in rows if row.get("signal_family") == "workforce")
    rows_365 = recent(365)
    values.update({
        "buyer_breadth_365d": float(len({row.get("buyer_id") for row in rows_365 if row.get("buyer_id")})),
        "new_geographies_365d": float(len({(row.get("country_code"), row.get("state_code"), row.get("county_fips")) for row in rows_365 if row.get("state_code") or row.get("county_fips")})),
        "facilities_opened_365d": float(event_types(rows_365, facilities_open)),
        "facilities_closed_365d": float(event_types(rows_365, facilities_closed)),
        "positive_workforce_signals_365d": float(event_types(rows_365, workforce_positive)),
        "negative_workforce_signals_365d": float(event_types(rows_365, workforce_negative)),
        "funding_signals_365d": float(event_types(rows_365, {"funding", "investment", "state_incentive", "sbir", "sttr", "nih_grant"})),
        "warn_signals_365d": float(event_types(rows_365, {"layoff", "closure", "furlough"})),
        "relocation_origin_signals_365d": float(sum(row.get("geography_role") == "origin" for row in rows_365)),
        "relocation_destination_signals_365d": float(sum(row.get("geography_role") == "destination" for row in rows_365)),
        "history_days": float((cutoff.date() - min((row["_occurred"].date() for row in selected), default=cutoff.date())).days),
    })
    values["contract_acceleration_90d"] = values["contracts_90d"] - values["contracts_365d"] * (90 / 365)
    values["job_posting_acceleration_90d"] = values["job_postings_90d"] - values["job_postings_365d"] * (90 / 365)
    signature = json.dumps({
        "company_id": company_id, "model_type": model_type, "as_of_date": as_of_date.isoformat(),
        "source_times": source_times, "formation_date": formation_date.isoformat() if formation_date else None,
    }, sort_keys=True, separators=(",", ":"))
    return {
        "snapshot_fingerprint": hashlib.sha256(signature.encode()).hexdigest(),
        "model_type": model_type,
        "as_of_date": as_of_date,
        "company_id": company_id,
        "country_code": None, "state_code": None, "county_fips": None, "industry_code": None,
        "feature_values": values,
        "feature_observation_cutoff": cutoff,
        "source_observation_times": source_times,
    }
