from __future__ import annotations

from datetime import date, datetime, time, timezone
import hashlib
from pathlib import Path
from typing import Any

from ingestion.adapters import FetchWindow, SourceEnvelope
from operations.capacity import CapacityGuard, CapacityStop

from .adapter import TEDAdapter
from .bulk import TEDBulkClient, iter_xml
from .xml import parse_ted_xml


class TEDSyncService:
    def __init__(self, repository: Any, adapter: TEDAdapter | None = None):
        self.repository = repository
        self.adapter = adapter or TEDAdapter()

    def sync(self, start: date, end: date, *, limit: int | None = None, capacity_guard: CapacityGuard | None = None, historical: bool = False) -> dict[str, Any]:
        start_at = datetime.combine(start, time.min, tzinfo=timezone.utc)
        end_at = datetime.combine(end, time.max, tzinfo=timezone.utc)
        key = f"{start.isoformat()}..{end.isoformat()}"
        self.repository.start_source_sync(self.adapter.source_system, key)
        stats: dict[str, Any] = {"status": "success", "source": self.adapter.source_system, "received": 0, "written": 0, "duplicates": 0, "failed": 0}
        checkpoint = None
        try:
            if capacity_guard:
                capacity_guard.check(source_system="eu_ted", operation="eu-historical-backfill" if historical else "eu-daily-sync", chunk_key=key, historical=historical)
            for envelope in self.adapter.fetch(FetchWindow(start_at, end_at), limit=limit):
                stats["received"] += 1
                checkpoint = self.adapter.checkpoint(envelope)
                try:
                    inserted = self.repository.ingest_eu_notice(self.adapter.normalize(envelope))
                    stats["written"] += int(inserted)
                    stats["duplicates"] += int(not inserted)
                except Exception:
                    stats["failed"] += 1
                if capacity_guard and stats["received"] % 250 == 0:
                    capacity_guard.check(source_system="eu_ted", operation="eu-historical-backfill" if historical else "eu-daily-sync", chunk_key=key, historical=historical, metadata={"records_received": stats["received"]})
            if limit is not None and stats["received"] >= limit:
                stats.update(status="partial", bounded_limit=limit)
            if stats["failed"]:
                stats["status"] = "partial"
            self.repository.finish_source_sync("eu_ted", key, stats["status"], stats, checkpoint_value=checkpoint)
            return stats
        except CapacityStop as exc:
            stats.update(status="controlled_stop", capacity=exc.report)
            self.repository.finish_source_sync("eu_ted", key, "partial", stats, checkpoint_value=checkpoint, error_summary=str(exc))
            return stats
        except Exception as exc:
            stats["status"] = "failed"
            self.repository.finish_source_sync("eu_ted", key, "failed", stats, checkpoint_value=checkpoint, error_summary=f"{type(exc).__name__}: {exc}")
            raise


class TEDBackfillService:
    def __init__(self, repository: Any, client: TEDBulkClient | None = None, capacity_guard: CapacityGuard | None = None):
        self.repository = repository
        self.client = client or TEDBulkClient()
        self.capacity_guard = capacity_guard

    def run_month(self, year: int, month: int, cache_dir: Path, *, max_records: int | None = None) -> dict[str, Any]:
        package = self.client.monthly(year, month)
        key = f"bulk:{package.key}"
        previous = self.repository.source_checkpoint("eu_ted", key)
        if previous and previous.get("status") == "success":
            return {"status": "success", "checkpoint": key, "resumed": True, "already_complete": True}
        self.repository.start_source_sync("eu_ted", key)
        stats: dict[str, Any] = {"status": "success", "source": "eu_ted", "received": 0, "written": 0, "duplicates": 0, "failed": 0}
        last_member = None
        try:
            if self.capacity_guard:
                self.capacity_guard.check(source_system="eu_ted", operation="eu-bulk-backfill", chunk_key=key)
            path = self.client.download(package, cache_dir)
            adapter = TEDAdapter()
            for member, xml in iter_xml(path):
                if previous and previous.get("checkpoint_value") and member <= previous["checkpoint_value"]:
                    continue
                parsed = parse_ted_xml(xml)
                parsed["raw_xml_member"] = member
                # Bulk XML is normalized through a compact Search-API-shaped envelope.
                payload = {
                    "notice-identifier": parsed.get("notice_id"),
                    "notice-version": parsed.get("notice_version"),
                    "procedure-identifier": parsed.get("procedure_id"),
                    "publication-number": parsed.get("publication_number"),
                    "publication-date": parsed.get("publication_date"),
                    "dispatch-date": parsed.get("dispatch_date"),
                    "notice-type": parsed.get("notice_type"),
                    "notice-subtype": parsed.get("notice_subtype"),
                    "buyer-name": parsed.get("buyer_name"),
                    "buyer-country": parsed.get("buyer_country"),
                    "organisation-identifier-buyer": parsed.get("buyer_id"),
                    "classification-cpv": parsed.get("cpv_codes"),
                    "performance-country": parsed.get("performance_countries"),
                    "nuts-codes": parsed.get("nuts_codes"),
                    "identifier-lot": parsed.get("lot_ids"),
                    "contract-identifier": parsed.get("contract_ids"),
                    "organisation-name-tenderer": parsed.get("supplier_names"),
                    "organisation-identifier-tenderer": parsed.get("supplier_ids"),
                    "result-value-notice": str(parsed["value_native"]) if parsed.get("value_native") is not None else None,
                    "result-value-cur-notice": parsed.get("currency"),
                    "links": {"xml": {"MUL": package.url}},
                    "bulk": {
                        "package": package.key,
                        "member": member,
                        "format": parsed.get("format"),
                        "xml_sha256": hashlib.sha256(xml).hexdigest(),
                    },
                }
                notice_id = parsed.get("notice_id") or parsed.get("publication_number")
                if not notice_id:
                    stats["failed"] += 1
                    continue
                observed = parsed.get("publication_date") or datetime(year, month, 1, tzinfo=timezone.utc)
                envelope = SourceEnvelope("eu_ted", notice_id, f"https://ted.europa.eu/en/notice/-/detail/{parsed.get('publication_number') or notice_id}", observed, payload)
                stats["received"] += 1
                try:
                    inserted = self.repository.ingest_eu_notice(adapter.normalize(envelope))
                    stats["written"] += int(inserted)
                    stats["duplicates"] += int(not inserted)
                except Exception:
                    stats["failed"] += 1
                last_member = member
                if self.capacity_guard and stats["received"] % 250 == 0:
                    self.capacity_guard.check(source_system="eu_ted", operation="eu-bulk-backfill", chunk_key=f"{key}:{member}")
                    self.repository.update_source_checkpoint("eu_ted", key, member, stats)
                if max_records is not None and stats["received"] >= max_records:
                    stats.update(status="partial", bounded_limit=max_records)
                    break
            if stats["failed"]:
                stats["status"] = "partial"
            self.repository.finish_source_sync("eu_ted", key, stats["status"], stats, checkpoint_value=last_member)
            return stats
        except CapacityStop as exc:
            stats.update(status="controlled_stop", capacity=exc.report)
            self.repository.finish_source_sync("eu_ted", key, "partial", stats, checkpoint_value=last_member, error_summary=str(exc))
            return stats
        except Exception as exc:
            self.repository.finish_source_sync("eu_ted", key, "failed", stats, checkpoint_value=last_member, error_summary=f"{type(exc).__name__}: {exc}")
            raise
