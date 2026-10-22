from __future__ import annotations

import csv
import json
import logging
import os
import re
import time
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, Iterator
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from operations.capacity import CapacityGuard, CapacityStop

from .industry import IndustryClassifier
from .normalize import normalize_transaction

LOGGER = logging.getLogger("federal_ledger.backfill")


def _log(event: str, **fields) -> None:
    LOGGER.info(json.dumps({"event": event, **fields}, default=str, separators=(",", ":")))


def fiscal_year(day: date) -> int:
    return day.year + int(day.month >= 10)


def fiscal_years(start: date, end: date) -> list[int]:
    if end < start:
        raise ValueError("end date must be on or after start date")
    return list(range(fiscal_year(start), fiscal_year(end) + 1))


@dataclass(frozen=True)
class Archive:
    fiscal_year: int | None
    file_name: str
    url: str
    updated_at: datetime | None = None


class USAspendingArchiveClient:
    """Discovers official full contract archives and downloads them resumably."""

    def __init__(self, base_url: str = "https://api.usaspending.gov"):
        self.list_url = f"{base_url.rstrip('/')}/api/v2/bulk_download/list_monthly_files/"
        self.session = requests.Session()
        retry = Retry(
            total=5,
            backoff_factor=1.0,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=("GET", "HEAD", "POST"),
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.headers.update({"User-Agent": "FederalLedger/0.2", "Accept": "application/json"})

    def list_full_archives(self, start: date, end: date) -> list[Archive]:
        archives: list[Archive] = []
        for year in fiscal_years(start, end):
            response = self.session.post(
                self.list_url,
                json={"agency": "all", "fiscal_year": year, "type": "contracts"},
                timeout=60,
            )
            response.raise_for_status()
            candidates = [
                item
                for item in response.json().get("monthly_files", [])
                if item.get("fiscal_year") == year and "_Full_" in str(item.get("file_name", ""))
            ]
            if not candidates:
                raise RuntimeError(f"USAspending did not publish a full contracts archive for FY{year}")
            item = max(candidates, key=lambda value: str(value.get("updated_date") or ""))
            updated = item.get("updated_date")
            archives.append(
                Archive(
                    fiscal_year=year,
                    file_name=str(item["file_name"]),
                    url=str(item["url"]),
                    updated_at=datetime.fromisoformat(updated).replace(tzinfo=timezone.utc) if updated else None,
                )
            )
        return archives

    def download(
        self,
        archive: Archive,
        cache_dir: Path,
        progress: Callable[[int, int | None, str | None], None] | None = None,
    ) -> Path:
        cache_dir.mkdir(parents=True, exist_ok=True)
        safe_name = Path(archive.file_name).name
        if safe_name != archive.file_name or not safe_name.lower().endswith(".zip"):
            raise ValueError("archive file name is not a safe ZIP file name")
        target = (cache_dir / safe_name).resolve()
        if cache_dir.resolve() not in target.parents:
            raise ValueError("archive target escaped the cache directory")
        partial = target.with_suffix(target.suffix + ".part")

        head = self.session.head(archive.url, allow_redirects=True, timeout=60)
        head.raise_for_status()
        total = int(head.headers["Content-Length"]) if head.headers.get("Content-Length", "").isdigit() else None
        etag = head.headers.get("ETag")
        if target.exists() and (total is None or target.stat().st_size == total):
            if progress:
                progress(target.stat().st_size, total, etag)
            return target

        offset = partial.stat().st_size if partial.exists() else 0
        headers = {"Range": f"bytes={offset}-"} if offset else {}
        with self.session.get(archive.url, headers=headers, stream=True, timeout=(30, 300)) as response:
            response.raise_for_status()
            resumed = offset > 0 and response.status_code == 206
            if offset and not resumed:
                offset = 0
            mode = "ab" if resumed else "wb"
            downloaded = offset
            next_report = downloaded
            with partial.open(mode) as handle:
                for chunk in response.iter_content(chunk_size=8 * 1024 * 1024):
                    if not chunk:
                        continue
                    handle.write(chunk)
                    downloaded += len(chunk)
                    if progress and downloaded >= next_report:
                        progress(downloaded, total, etag)
                        next_report = downloaded + 64 * 1024 * 1024
                handle.flush()
                os.fsync(handle.fileno())
        if total is not None and downloaded != total:
            raise IOError(f"archive download size mismatch: expected {total}, received {downloaded}")
        partial.replace(target)
        if progress:
            progress(downloaded, total, etag)
        return target


def _first(row: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return None


def archive_row_to_source(row: dict[str, str]) -> dict:
    """Translate current and legacy USAspending contract archive columns."""
    recipient = {
        "address_line1": _first(row, "recipient_address_line_1", "legal_entity_address_line1"),
        "city_name": _first(row, "recipient_city_name", "legal_entity_city_name"),
        "county_name": _first(row, "recipient_county_name", "legal_entity_county_name"),
        "county_fips": _first(row, "recipient_county_fips_code", "legal_entity_county_code"),
        "state_code": _first(row, "recipient_state_code", "legal_entity_state_code"),
        "state_fips": _first(row, "recipient_state_fips_code", "legal_entity_state_code"),
        "zip": _first(row, "recipient_zip_4_code", "legal_entity_zip4"),
        "country_code": _first(row, "recipient_country_code", "legal_entity_country_code"),
    }
    performance = {
        "city_name": _first(row, "primary_place_of_performance_city_name"),
        "county_name": _first(row, "primary_place_of_performance_county_name"),
        "county_fips": _first(row, "primary_place_of_performance_county_fips_code", "primary_place_of_perform_county_code"),
        "state_code": _first(row, "primary_place_of_performance_state_code"),
        "state_fips": _first(row, "primary_place_of_performance_state_fips_code"),
        "zip": _first(row, "primary_place_of_performance_zip_4", "place_of_performance_zip4a"),
        "country_code": _first(row, "primary_place_of_performance_country_code"),
    }
    return {
        "transaction_id": _first(row, "contract_transaction_unique_key", "transaction_unique_id"),
        "internal_id": _first(row, "internal_id"),
        "generated_internal_id": _first(row, "contract_award_unique_key", "award_unique_key", "generated_internal_id"),
        "Award ID": _first(row, "award_id_piid", "piid", "Award ID"),
        "Parent Award ID": _first(row, "parent_award_id_piid", "parent_award_piid"),
        "Recipient Name": _first(row, "recipient_name", "awardee_or_recipient_legal", "Recipient Name"),
        "Recipient UEI": _first(row, "recipient_uei", "awardee_or_recipient_uniqu"),
        "CAGE Code": _first(row, "cage_code"),
        "Recipient Location": recipient,
        "Primary Place of Performance": performance,
        "Action Date": _first(row, "action_date", "Action Date"),
        "Action Type": _first(row, "action_type", "action_type_description"),
        "Transaction Amount": _first(row, "federal_action_obligation", "federal_action_obligation_amount"),
        "Total Obligated Amount": _first(row, "total_dollars_obligated"),
        "Current Award Amount": _first(row, "current_total_value_of_award", "base_and_exercised_options_value"),
        "Potential Award Amount": _first(row, "potential_total_value_of_award", "base_and_all_options_value"),
        "Awarding Department": _first(row, "awarding_toptier_agency_name"),
        "Awarding Agency": _first(row, "awarding_agency_name"),
        "Awarding Sub Agency": _first(row, "awarding_sub_agency_name", "awarding_subtier_agency_name"),
        "Transaction Description": _first(row, "transaction_description", "award_description", "description"),
        "Award Type": _first(row, "award_type", "award_type_code"),
        "Mod": _first(row, "modification_number"),
        "NAICS": _first(row, "naics_code"),
        "PSC": _first(row, "product_or_service_code"),
        "Business Size": _first(row, "contracting_officers_determination_of_business_size"),
        "Issued Date": _first(row, "award_base_action_date", "action_date"),
        "Start Date": _first(row, "period_of_performance_start_date"),
        "End Date": _first(row, "period_of_performance_current_end_date"),
        "Last Modified Date": _first(row, "last_modified_date"),
    }


def iter_archive_rows(path: Path) -> Iterator[tuple[str, int, dict[str, str]]]:
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            for number, row in enumerate(csv.DictReader(handle), start=1):
                yield path.name, number, row
        return
    with zipfile.ZipFile(path) as archive:
        members = sorted(
            (info for info in archive.infolist() if not info.is_dir() and info.filename.lower().endswith(".csv")),
            key=lambda info: info.filename,
        )
        if not members:
            raise ValueError(f"{path.name} contains no CSV members")
        for member in members:
            with archive.open(member, "r") as binary:
                import io

                with io.TextIOWrapper(binary, encoding="utf-8-sig", newline="") as text:
                    for number, row in enumerate(csv.DictReader(text), start=1):
                        yield member.filename, number, row


class BackfillRunner:
    def __init__(
        self,
        repository,
        client: USAspendingArchiveClient,
        classifier: IndustryClassifier | None = None,
        capacity_guard: CapacityGuard | None = None,
    ):
        self.repository = repository
        self.client = client
        self.classifier = classifier or IndustryClassifier()
        self.capacity_guard = capacity_guard

    def _run_archive(
        self,
        archive: Archive,
        start: date,
        end: date,
        cache_dir: Path,
        batch_size: int,
        max_records: int | None,
        source_file: Path | None = None,
    ) -> dict:
        job = self.repository.create_or_resume_backfill_job(
            start_date=start,
            end_date=end,
            source_url=archive.url,
            source_file_name=archive.file_name,
            batch_size=batch_size,
            fiscal_year=archive.fiscal_year,
            source_updated_at=archive.updated_at,
            metadata={"bounded_max_records": max_records} if max_records else {},
        )
        if job["status"] == "success":
            return {"job_id": str(job["id"]), "status": "success", "resumed": True, "already_complete": True}
        job_id = str(job["id"])
        started = time.monotonic()
        try:
            if self.capacity_guard:
                self.capacity_guard.check(
                    source_system="usaspending",
                    operation="us-historical-backfill",
                    chunk_key=archive.file_name,
                    metadata={"phase": "before_download", "job_id": job_id},
                )
            if source_file:
                path = source_file
                self.repository.update_backfill_download(job_id, status="importing", bytes_downloaded=path.stat().st_size, source_size_bytes=path.stat().st_size)
            else:
                path = self.client.download(
                    archive,
                    cache_dir,
                    lambda received, total, etag: self.repository.update_backfill_download(
                        job_id, bytes_downloaded=received, source_size_bytes=total, source_etag=etag
                    ),
                )
                self.repository.update_backfill_download(job_id, status="importing")

            resume_member = job.get("current_member")
            resume_row = int(job.get("member_row") or 0)
            rows_processed = int(job.get("rows_processed") or 0)
            accepted = 0
            skipped = 0
            failed = 0
            row_error: str | None = None
            batch: list[dict] = []
            batch_checkpoint: dict | None = None
            last_member = None
            last_row = 0
            committed_member = resume_member
            committed_row = resume_row
            committed_rows_processed = int(job.get("rows_processed") or 0)
            for member, row_number, archive_row in iter_archive_rows(path):
                if resume_member and (member < resume_member or (member == resume_member and row_number <= resume_row)):
                    continue
                rows_processed += 1
                last_member, last_row = member, row_number
                raw = archive_row_to_source(archive_row)
                action_value = raw.get("Action Date")
                try:
                    action_date = date.fromisoformat(str(action_value)[:10]) if action_value else None
                except ValueError:
                    action_date = None
                if action_date is None or not (start <= action_date <= end):
                    skipped += 1
                    continue
                try:
                    fetched_at = archive.updated_at or datetime.now(timezone.utc)
                    batch.append(normalize_transaction(raw, fetched_at, self.classifier))
                    accepted += 1
                    batch_checkpoint = {"member": member, "member_row": row_number, "rows_processed": rows_processed}
                except Exception as exc:
                    failed += 1
                    row_error = f"{type(exc).__name__} at {member}:{row_number}: {exc}"
                    _log("backfill_row_rejected", job_id=job_id, member=member, row=row_number, error_type=type(exc).__name__)
                    # Stop at the first malformed source row. A later successful
                    # batch must never move the restart checkpoint past it.
                    break
                if len(batch) >= batch_size:
                    if self.capacity_guard:
                        self.capacity_guard.check(
                            source_system="usaspending",
                            operation="us-historical-backfill",
                            chunk_key=f"{archive.file_name}:{member}:{row_number}",
                            metadata={"phase": "before_batch", "job_id": job_id, "batch_records": len(batch)},
                        )
                    self.repository.ingest_batch(batch, backfill_job_id=job_id, checkpoint=batch_checkpoint)
                    committed_member = batch_checkpoint["member"]
                    committed_row = batch_checkpoint["member_row"]
                    committed_rows_processed = batch_checkpoint["rows_processed"]
                    _log("backfill_batch_committed", job_id=job_id, size=len(batch), member=member, row=row_number)
                    batch = []
                if max_records is not None and accepted >= max_records:
                    break
            if batch:
                if self.capacity_guard:
                    self.capacity_guard.check(
                        source_system="usaspending",
                        operation="us-historical-backfill",
                        chunk_key=f"{archive.file_name}:{batch_checkpoint['member']}:{batch_checkpoint['member_row']}",
                        metadata={"phase": "before_batch", "job_id": job_id, "batch_records": len(batch)},
                    )
                self.repository.ingest_batch(batch, backfill_job_id=job_id, checkpoint=batch_checkpoint)
                committed_member = batch_checkpoint["member"]
                committed_row = batch_checkpoint["member_row"]
                committed_rows_processed = batch_checkpoint["rows_processed"]
            status = "partial" if failed or (max_records is not None and accepted >= max_records) else "success"
            error = row_error or ("bounded run stopped at max_records" if max_records is not None and accepted >= max_records else None)
            final_member = committed_member if failed else last_member
            final_row = committed_row if failed else last_row
            final_rows_processed = committed_rows_processed if failed else rows_processed
            completed = self.repository.finish_backfill_job(
                job_id,
                status,
                skipped=0 if failed else skipped,
                failed=failed,
                error=error,
                member=final_member,
                member_row=final_row,
                rows_processed=final_rows_processed,
            )
            elapsed = max(time.monotonic() - started, 0.001)
            result = {
                "job_id": job_id,
                "status": status,
                "source_file": archive.file_name,
                "rows_scanned_this_run": max(0, rows_processed - int(job.get("rows_processed") or 0)),
                "records_accepted_this_run": accepted,
                "records_skipped_this_run": skipped,
                "records_failed_this_run": failed,
                "last_member": last_member,
                "last_member_row": last_row,
                "elapsed_seconds": round(elapsed, 3),
                "records_per_second": round(accepted / elapsed, 2),
                "totals": {key: completed[key] for key in (
                    "rows_processed", "rows_in_window", "batches_committed", "records_inserted", "records_updated",
                    "records_skipped", "records_failed", "companies_created", "awards_created", "transactions_created"
                )},
            }
            _log("backfill_completed", **result)
            return result
        except CapacityStop as exc:
            completed = self.repository.finish_backfill_job(
                job_id,
                "partial",
                error=str(exc),
            )
            result = {
                "job_id": job_id,
                "status": "controlled_stop",
                "source_file": archive.file_name,
                "reason": str(exc),
                "capacity": exc.report,
                "totals": {key: completed[key] for key in (
                    "rows_processed", "rows_in_window", "batches_committed", "records_inserted", "records_updated",
                    "records_skipped", "records_failed", "companies_created", "awards_created", "transactions_created"
                )},
            }
            _log("backfill_controlled_stop", **result)
            return result
        except Exception as exc:
            self.repository.finish_backfill_job(job_id, "failed", error=f"{type(exc).__name__}: {exc}")
            _log("backfill_failed", job_id=job_id, error_type=type(exc).__name__)
            raise

    def run(
        self,
        start: date,
        end: date,
        cache_dir: Path,
        batch_size: int = 1000,
        max_records: int | None = None,
        source_file: Path | None = None,
    ) -> dict:
        if end < start:
            raise ValueError("end date must be on or after start date")
        if max_records is not None and max_records < 1:
            raise ValueError("max_records must be positive")
        if source_file:
            source_file = source_file.resolve()
            archive = Archive(None, source_file.name, source_file.as_uri(), datetime.fromtimestamp(source_file.stat().st_mtime, timezone.utc))
            archives = [archive]
        else:
            archives = self.client.list_full_archives(start, end)
        results = [
            self._run_archive(archive, start, end, cache_dir, batch_size, max_records, source_file)
            for archive in archives
        ]
        return {
            "status": "success" if all(result["status"] == "success" for result in results) else "partial",
            "start": start.isoformat(),
            "end": end.isoformat(),
            "archives": results,
        }
