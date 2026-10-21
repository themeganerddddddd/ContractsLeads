from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09",
    "DE": "10", "DC": "11", "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17",
    "IN": "18", "IA": "19", "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24",
    "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30", "NE": "31",
    "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38",
    "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46",
    "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53", "WV": "54",
    "WI": "55", "WY": "56", "PR": "72",
}


@dataclass(frozen=True)
class Geography:
    address: str | None = None
    city: str | None = None
    county: str | None = None
    county_fips: str | None = None
    state: str | None = None
    state_fips: str | None = None
    zip: str | None = None
    country: str | None = None

    def to_dict(self) -> dict[str, str | None]:
        return asdict(self)


def _first(mapping: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = mapping.get(key)
        if value not in (None, ""):
            return str(value).strip() or None
    return None


def normalize_geography(value: Any) -> Geography:
    """Normalize one location object without consulting any other location."""
    if not isinstance(value, dict):
        return Geography(address=str(value).strip() or None) if value else Geography()
    state = _first(value, "state_code", "state", "state_name")
    state = state.upper() if state and len(state) == 2 else state
    state_fips = _first(value, "state_fips", "state_fips_code") or STATE_FIPS.get(state or "")
    county_code = _first(value, "county_fips", "county_fips_code", "county_code")
    county_fips = None
    if county_code:
        digits = "".join(character for character in county_code if character.isdigit())
        if len(digits) == 5:
            county_fips = digits
        elif len(digits) == 3 and state_fips:
            county_fips = f"{state_fips}{digits}"
    return Geography(
        address=_first(value, "address_line1", "address", "street_address"),
        city=_first(value, "city_name", "city"),
        county=_first(value, "county_name", "county"),
        county_fips=county_fips,
        state=state,
        state_fips=state_fips,
        zip=_first(value, "zip5", "zip", "zip_code", "postal_code"),
        country=_first(value, "country_code", "country_name", "country"),
    )
