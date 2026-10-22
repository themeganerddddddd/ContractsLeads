from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from ingestion.adapters import FetchWindow
from operations.capacity import CapacityGuard, CapacityStop

from .adapter import FindATenderAdapter


class UKSyncService:
    def __init__(self, repository: Any, adapter: FindATenderAdapter | None = None):
        self.repository = repository
        self.adapter = adapter or FindATenderAdapter()

    def sync(
        self,
        start: datetime,
        end: datetime,
        *,
        limit: int | None = None,
        capacity_guard: CapacityGuard | None = None,
        historical: bool = False,
    ) -> dict[str, Any]:
        if end < start:
            raise ValueError("end must not precede start")
        checkpoint_key = f"{start.isoformat()}..{end.isoformat()}"
        self.repository.start_source_sync(self.adapter.source_system, checkpoint_key)
        stats = {"status": "success", "source": self.adapter.source_system, "received": 0, "written": 0, "duplicates": 0, "failed": 0}
        last_checkpoint: str | None = None
        try:
            if capacity_guard:
                capacity_guard.check(
                    source_system=self.adapter.source_system,
                    operation="uk-historical-backfill" if historical else "uk-daily-sync",
                    chunk_key=checkpoint_key,
                    historical=historical,
                )
            for envelope in self.adapter.fetch(FetchWindow(start, end), limit=limit):
                stats["received"] += 1
                last_checkpoint = self.adapter.checkpoint(envelope)
                try:
                    inserted = self.repository.ingest_global_release(self.adapter.normalize(envelope))
                    stats["written"] += int(inserted)
                    stats["duplicates"] += int(not inserted)
                except Exception:
                    stats["failed"] += 1
                if capacity_guard and stats["received"] % 250 == 0:
                    capacity_guard.check(
                        source_system=self.adapter.source_system,
                        operation="uk-historical-backfill" if historical else "uk-daily-sync",
                        chunk_key=checkpoint_key,
                        historical=historical,
                        metadata={"records_received": stats["received"]},
                    )
            if limit is not None and stats["received"] >= limit:
                stats["status"] = "partial"
                stats["bounded_limit"] = limit
            if stats["failed"]:
                stats["status"] = "partial"
            self.repository.finish_source_sync(
                self.adapter.source_system, checkpoint_key, stats["status"], stats,
                checkpoint_value=last_checkpoint,
            )
            return stats
        except CapacityStop as exc:
            stats["status"] = "controlled_stop"
            stats["capacity"] = exc.report
            self.repository.finish_source_sync(
                self.adapter.source_system, checkpoint_key, "partial", stats,
                checkpoint_value=last_checkpoint, error_summary=str(exc),
            )
            return stats
        except Exception as exc:
            stats["status"] = "failed"
            self.repository.finish_source_sync(
                self.adapter.source_system, checkpoint_key, "failed", stats,
                checkpoint_value=last_checkpoint, error_summary=f"{type(exc).__name__}: {exc}",
            )
            raise


class UKBackfillService:
    def __init__(self, repository: Any, adapter: FindATenderAdapter | None = None, capacity_guard: CapacityGuard | None = None):
        self.repository = repository
        self.sync_service = UKSyncService(repository, adapter)
        self.capacity_guard = capacity_guard

    def run(self, start: datetime, end: datetime, *, window_days: int = 7, limit_per_window: int | None = None) -> dict[str, Any]:
        if end < start:
            raise ValueError("end must not precede start")
        if window_days < 1:
            raise ValueError("window_days must be positive")
        results: list[dict[str, Any]] = []
        cursor = start
        while cursor <= end:
            window_end = min(end, cursor + timedelta(days=window_days) - timedelta(microseconds=1))
            key = f"{cursor.isoformat()}..{window_end.isoformat()}"
            previous = self.repository.source_checkpoint(self.sync_service.adapter.source_system, key)
            if previous and previous.get("status") == "success":
                results.append({"status": "success", "checkpoint": key, "resumed": True, "already_complete": True})
            else:
                result = self.sync_service.sync(
                    cursor,
                    window_end,
                    limit=limit_per_window,
                    capacity_guard=self.capacity_guard,
                    historical=True,
                )
                result["checkpoint"] = key
                results.append(result)
                if result["status"] == "controlled_stop":
                    break
            cursor = window_end + timedelta(microseconds=1)
        status = "controlled_stop" if any(row["status"] == "controlled_stop" for row in results) else (
            "success" if all(row["status"] == "success" for row in results) else "partial"
        )
        return {"status": status, "source": self.sync_service.adapter.source_system, "windows": results}
