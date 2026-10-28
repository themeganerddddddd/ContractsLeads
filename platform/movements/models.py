from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Iterable, Protocol


def stable_hash(*parts: object) -> str:
    return hashlib.sha256("|".join(str(part or "") for part in parts).encode("utf-8")).hexdigest()


def payload_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


@dataclass(frozen=True)
class MovementEnvelope:
    source_system: str
    document_identifier: str
    source_url: str
    publisher: str
    publication_date: date | None
    observed_at: datetime
    source_type: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class NormalizedMovement:
    event: dict[str, Any]
    source: dict[str, Any]
    observed_company_name: str | None
    location: dict[str, Any] | None = None
    identifiers: tuple[dict[str, str], ...] = ()


@dataclass(frozen=True)
class CompanyMatch:
    status: str
    company: dict[str, Any] | None
    candidates: tuple[dict[str, Any], ...]
    method: str | None
    confidence: float | None


class MovementSourceAdapter(Protocol):
    source_system: str

    def fetch(self, *, limit: int | None = None) -> Iterable[MovementEnvelope]: ...

    def normalize(self, envelope: MovementEnvelope) -> NormalizedMovement: ...

    def checkpoint(self, envelope: MovementEnvelope) -> str: ...
