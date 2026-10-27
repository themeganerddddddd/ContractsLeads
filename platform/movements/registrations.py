from __future__ import annotations

from typing import Any, Protocol


class BusinessRegistrationAdapter(Protocol):
    """Interface for official sources whose access and reuse terms were verified."""

    source_system: str
    official_url: str
    reuse_status: str

    def collect(self, checkpoint: str | None = None) -> list[dict[str, Any]]: ...


def adapter_status(adapters: list[BusinessRegistrationAdapter]) -> dict[str, Any]:
    return {
        "status": "available" if adapters else "unsupported",
        "configured_adapters": [adapter.source_system for adapter in adapters],
        "reason": None if adapters else "No official registration source with verified access and commercial reuse is configured.",
    }
