from __future__ import annotations

import json
import logging
from collections.abc import Iterable
from datetime import date, datetime
from typing import Any

from .matching import match_company_name
from .models import CompanyMatch, MovementSourceAdapter
from .permits import MontgomeryCountyPermitAdapter


LOGGER = logging.getLogger("federal_ledger.movements")


def _log(event: str, **fields: Any) -> None:
    LOGGER.info(json.dumps({"event": event, **fields}, default=str, separators=(",", ":")))


class MovementIngestionService:
    def __init__(self, repository):
        self.repository = repository

    def sync(self, adapter: MovementSourceAdapter, *, limit: int | None = None) -> dict[str, Any]:
        checkpoint_key = "current"
        stats: dict[str, Any] = {
            "source_system": adapter.source_system,
            "received": 0,
            "written": 0,
            "matched": 0,
            "ambiguous": 0,
            "unmatched": 0,
            "failed": 0,
        }
        errors: list[str] = []
        last_checkpoint: str | None = None
        self.repository.start_source_sync(adapter.source_system, checkpoint_key)
        _log("movement_sync_started", source_system=adapter.source_system, limit=limit)
        try:
            for envelope in adapter.fetch(limit=limit):
                stats["received"] += 1
                try:
                    movement = adapter.normalize(envelope)
                    match = None
                    for identifier in movement.identifiers:
                        company = self.repository.company_by_identifier(
                            identifier["system"], identifier["value"], identifier.get("country_code")
                        )
                        if company:
                            method = "sec_cik" if identifier["system"].upper() in {"CIK", "SEC_CIK"} else identifier["system"].casefold()
                            match = CompanyMatch("matched", company, (company,), method, 1.0)
                            break
                    if match is None:
                        candidates = self.repository.company_candidates(movement.observed_company_name)
                        match = match_company_name(movement.observed_company_name, candidates)
                    self.repository.persist(movement, match)
                    stats["written"] += 1
                    stats[match.status] += 1
                    last_checkpoint = adapter.checkpoint(envelope)
                except Exception as exc:
                    stats["failed"] += 1
                    if len(errors) < 20:
                        errors.append(f"{type(exc).__name__}: {exc}")
                    _log(
                        "movement_record_failed",
                        source_system=adapter.source_system,
                        document_identifier=envelope.document_identifier,
                        error_type=type(exc).__name__,
                    )
            status = "partial" if stats["failed"] else "success"
        except Exception as exc:
            status = "failed"
            errors.append(f"{type(exc).__name__}: {exc}")
            _log("movement_source_failed", source_system=adapter.source_system, error_type=type(exc).__name__)
        stats["status"] = status
        self.repository.finish_source_sync(
            adapter.source_system,
            checkpoint_key,
            status,
            stats,
            checkpoint_value=last_checkpoint,
            error_summary="\n".join(errors) or None,
        )
        _log("movement_sync_completed", **stats)
        return stats

    def sync_all(self, adapters: Iterable[MovementSourceAdapter], *, limit: int | None = None) -> dict[str, Any]:
        results = [self.sync(adapter, limit=limit) for adapter in adapters]
        failed = sum(result["status"] == "failed" for result in results)
        partial = sum(result["status"] == "partial" for result in results)
        return {
            "status": "partial" if failed or partial else "success",
            "sources": results,
            "sources_failed": failed,
        }


class PermitIngestionService:
    def __init__(self, repository):
        self.repository = repository

    def sync(
        self,
        adapter: MontgomeryCountyPermitAdapter,
        *,
        since: date | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        checkpoint_key = "current"
        checkpoint = self.repository.source_checkpoint(adapter.source_system, checkpoint_key)
        if since is None and checkpoint and checkpoint.get("checkpoint_value"):
            try:
                since = date.fromisoformat(str(checkpoint["checkpoint_value"])[:10])
            except ValueError:
                since = None
        stats: dict[str, Any] = {
            "source_system": adapter.source_system,
            "received": 0,
            "written": 0,
            "inserted": 0,
            "updated": 0,
            "skipped_not_relevant": 0,
            "failed": 0,
        }
        errors: list[str] = []
        last_checkpoint: str | None = None
        self.repository.start_source_sync(adapter.source_system, checkpoint_key)
        try:
            for raw in adapter.fetch(since=since, limit=limit):
                stats["received"] += 1
                last_checkpoint = adapter.checkpoint(raw) or last_checkpoint
                try:
                    permit = adapter.normalize(raw)
                    if permit["relevance_classification"] == "not_relevant":
                        stats["skipped_not_relevant"] += 1
                        continue
                    result = self.repository.upsert_permit(permit)
                    stats["written"] += 1
                    stats["inserted" if result["inserted"] else "updated"] += 1
                except Exception as exc:
                    stats["failed"] += 1
                    if len(errors) < 20:
                        errors.append(f"{type(exc).__name__}: {exc}")
                    _log("permit_record_failed", source_system=adapter.source_system, error_type=type(exc).__name__)
            status = "partial" if stats["failed"] else "success"
        except Exception as exc:
            status = "failed"
            errors.append(f"{type(exc).__name__}: {exc}")
            _log("permit_source_failed", source_system=adapter.source_system, error_type=type(exc).__name__)
        stats["status"] = status
        self.repository.finish_source_sync(
            adapter.source_system,
            checkpoint_key,
            status,
            stats,
            checkpoint_value=last_checkpoint,
            error_summary="\n".join(errors) or None,
        )
        return stats
