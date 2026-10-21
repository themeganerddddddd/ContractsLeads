from __future__ import annotations

from datetime import datetime
from typing import Any

from ingestion.adapters import FetchWindow

from .adapter import FindATenderAdapter


class UKSyncService:
    def __init__(self, repository: Any, adapter: FindATenderAdapter | None = None):
        self.repository = repository
        self.adapter = adapter or FindATenderAdapter()

    def sync(self, start: datetime, end: datetime, *, limit: int | None = None) -> dict[str, Any]:
        if end < start:
            raise ValueError("end must not precede start")
        checkpoint_key = f"{start.isoformat()}..{end.isoformat()}"
        self.repository.start_source_sync(self.adapter.source_system, checkpoint_key)
        stats = {"status": "success", "source": self.adapter.source_system, "received": 0, "written": 0, "duplicates": 0, "failed": 0}
        last_checkpoint: str | None = None
        try:
            for envelope in self.adapter.fetch(FetchWindow(start, end), limit=limit):
                stats["received"] += 1
                last_checkpoint = self.adapter.checkpoint(envelope)
                try:
                    inserted = self.repository.ingest_global_release(self.adapter.normalize(envelope))
                    stats["written"] += int(inserted)
                    stats["duplicates"] += int(not inserted)
                except Exception:
                    stats["failed"] += 1
            if stats["failed"]:
                stats["status"] = "partial"
            self.repository.finish_source_sync(
                self.adapter.source_system, checkpoint_key, stats["status"], stats,
                checkpoint_value=last_checkpoint,
            )
            return stats
        except Exception as exc:
            stats["status"] = "failed"
            self.repository.finish_source_sync(
                self.adapter.source_system, checkpoint_key, "failed", stats,
                checkpoint_value=last_checkpoint, error_summary=f"{type(exc).__name__}: {exc}",
            )
            raise
