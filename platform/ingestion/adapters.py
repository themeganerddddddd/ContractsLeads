from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable, Literal, Protocol


@dataclass(frozen=True)
class FetchWindow:
    start: datetime
    end: datetime
    cursor: str | None = None


@dataclass(frozen=True)
class SourceEnvelope:
    source_system: str
    source_id: str
    source_url: str
    observed_at: datetime
    payload: dict[str, Any]


class ProcurementSourceAdapter(Protocol):
    """Boundary every country source implements before database persistence."""

    source_system: str
    source_market: str
    country_code: str

    def fetch(self, window: FetchWindow, *, limit: int | None = None) -> Iterable[SourceEnvelope]: ...

    def normalize(self, envelope: SourceEnvelope) -> dict[str, Any]: ...

    def checkpoint(self, envelope: SourceEnvelope) -> str: ...


@dataclass(frozen=True)
class BusinessChangeObservation:
    """State-neutral boundary before company/location resolution.

    Adapters report what the official source observed. They do not promote an
    address to headquarters, treat an event as an outcome, or turn an evidence
    score into a probability.
    """

    source_system: str
    source_record_id: str
    source_url: str
    observed_at: datetime
    observed_business_name: str
    official_identifiers: tuple[tuple[str, str], ...]
    address_line: str | None
    city: str | None
    county: str | None
    county_fips: str | None
    state_code: str | None
    postal_code: str | None
    country_code: str
    observation_type: str
    evidence_family: Literal[
        "registrations", "licenses", "permits", "occupancy", "warn",
        "economic_development", "corporate", "property", "workforce",
        "government_business",
    ]
    event_date: datetime | None
    raw_archive_pointer: str | None
    content_hash: str
    metadata: dict[str, Any]


class BusinessChangeSourceAdapter(Protocol):
    """Common adapter contract for all state and local source families."""

    source_system: str
    country_code: str
    state_code: str | None
    evidence_family: str

    def fetch(self, window: FetchWindow, *, limit: int | None = None) -> Iterable[SourceEnvelope]: ...

    def normalize(self, envelope: SourceEnvelope) -> BusinessChangeObservation: ...

    def checkpoint(self, envelope: SourceEnvelope) -> str: ...
