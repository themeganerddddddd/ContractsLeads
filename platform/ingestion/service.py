from __future__ import annotations

import json
import logging
import time as clock
from datetime import date, datetime, time, timedelta, timezone

from .industry import IndustryClassifier
from .normalize import normalize_transaction

LOGGER = logging.getLogger("federal_ledger.ingestion")


def _log(event: str, **fields) -> None:
    LOGGER.info(json.dumps({"event": event, **fields}, default=str, separators=(",", ":")))


class IngestionService:
    def __init__(
        self,
        repository,
        client,
        overlap_days: int = 3,
        classifier: IndustryClassifier | None = None,
        batch_size: int = 500,
    ):
        self.repository = repository
        self.client = client
        self.overlap_days = max(1, overlap_days)
        self.classifier = classifier or IndustryClassifier()
        self.batch_size = max(1, batch_size)

    @staticmethod
    def _merge_batch_result(stats: dict, result: dict) -> None:
        stats["inserted"] += result["records_inserted"]
        stats["updated"] += result["records_updated"]
        for key in ("companies_created", "awards_created", "transactions_created", "batches_committed"):
            stats[key] += result[key]

    def _write_batch(self, batch: list[dict], stats: dict, errors: list[str]) -> None:
        if not batch:
            return
        if not hasattr(self.repository, "ingest_batch"):
            for normalized in batch:
                try:
                    if self.repository.ingest(normalized):
                        stats["inserted"] += 1
                    else:
                        stats["updated"] += 1
                except Exception as exc:
                    stats["failed"] += 1
                    if len(errors) < 20:
                        errors.append(f"{type(exc).__name__}: {exc}")
            stats["batches_committed"] += 1
            return
        try:
            result = self.repository.ingest_batch(batch)
            self._merge_batch_result(stats, result)
        except Exception as batch_exc:
            _log("ingestion_batch_retry", size=len(batch), error_type=type(batch_exc).__name__)
            try:
                result = self.repository.ingest_batch(batch)
                self._merge_batch_result(stats, result)
                return
            except Exception as retry_exc:
                _log("ingestion_batch_isolation", size=len(batch), error_type=type(retry_exc).__name__)
            # The repository rolls the batch back. Isolate malformed rows so one
            # source record does not make the whole date window unrecoverable.
            for normalized in batch:
                try:
                    result = self.repository.ingest_batch([normalized])
                    self._merge_batch_result(stats, result)
                except Exception as exc:
                    stats["failed"] += 1
                    if len(errors) < 20:
                        errors.append(f"{type(exc).__name__}: {exc}")

    def _run(
        self,
        start: date,
        end: date,
        date_type: str,
        source: str,
        max_records: int | None = None,
    ) -> dict:
        started = clock.monotonic()
        start_checkpoint = datetime.combine(start, time.min, tzinfo=timezone.utc)
        end_checkpoint = datetime.combine(end, time.max, tzinfo=timezone.utc)
        run_id = self.repository.start_run(source, start_checkpoint, end_checkpoint)
        stats = {
            "requested": 0, "received": 0, "inserted": 0, "updated": 0, "skipped": 0, "failed": 0,
            "companies_created": 0, "awards_created": 0, "transactions_created": 0, "batches_committed": 0,
        }
        errors: list[str] = []
        batch: list[dict] = []
        bounded = max_records is not None
        limit = max(1, max_records or 1)
        limit_reached = False
        _log("ingestion_started", run_id=run_id, source=source, start=start, end=end, date_type=date_type)
        try:
            for raw in self.client.iter_transactions(start, end, date_type=date_type):
                if bounded and stats["received"] >= limit:
                    limit_reached = True
                    break
                stats["requested"] += 1
                stats["received"] += 1
                try:
                    batch.append(normalize_transaction(raw, end_checkpoint, self.classifier))
                    if len(batch) >= self.batch_size:
                        self._write_batch(batch, stats, errors)
                        batch = []
                except Exception as exc:
                    stats["failed"] += 1
                    if len(errors) < 20:
                        errors.append(f"{type(exc).__name__}: {exc}")
            self._write_batch(batch, stats, errors)
            status = "partial" if stats["failed"] or limit_reached else "success"
            if bounded:
                stats["metadata"] = {"bounded_limit": limit, "limit_reached": limit_reached}
            stats["duration_ms"] = round((clock.monotonic() - started) * 1000)
            self.repository.finish_run(run_id, status, stats, "\n".join(errors) or None)
            _log("ingestion_completed", run_id=run_id, source=source, status=status, **stats)
            return {**stats, "status": status, "start": start.isoformat(), "end": end.isoformat(), "date_type": date_type}
        except Exception as exc:
            stats["duration_ms"] = round((clock.monotonic() - started) * 1000)
            self.repository.finish_run(run_id, "failed", stats, f"{type(exc).__name__}: {exc}")
            _log("ingestion_failed", run_id=run_id, source=source, error_type=type(exc).__name__, **stats)
            raise

    def sync(self, today: date | None = None, max_records: int | None = None) -> dict:
        end = today or date.today()
        checkpoint = self.repository.last_successful_checkpoint("usaspending")
        if checkpoint:
            start = checkpoint.date() - timedelta(days=self.overlap_days)
        else:
            start = end - timedelta(days=30)
        return self._run(start, end, "last_modified_date", "usaspending", max_records=max_records)

    def sync_window(self, start: date, end: date, max_records: int | None = None) -> dict:
        if end < start:
            raise ValueError("end date must be on or after start date")
        return self._run(start, end, "last_modified_date", "usaspending", max_records=max_records)

    def reconcile(self, days: int, today: date | None = None) -> dict:
        end = today or date.today()
        start = end - timedelta(days=max(1, days))
        return self._run(start, end, "action_date", "usaspending_reconciliation")

    def reconcile_window(self, start: date, end: date) -> dict:
        if end < start:
            raise ValueError("end date must be on or after start date")
        return self._run(start, end, "action_date", "usaspending_reconciliation")
