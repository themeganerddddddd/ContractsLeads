from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable, Protocol


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
    country_code: str

    def fetch(self, window: FetchWindow, *, limit: int | None = None) -> Iterable[SourceEnvelope]: ...

    def normalize(self, envelope: SourceEnvelope) -> dict[str, Any]: ...

    def checkpoint(self, envelope: SourceEnvelope) -> str: ...
