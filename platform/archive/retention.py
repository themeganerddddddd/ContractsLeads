from __future__ import annotations

import gzip
import hashlib
import json
import re
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Sequence

from psycopg import sql

from .backend import ArchiveBackend
from .manifest import ArchiveManifest, ArchiveManifestItem, ManifestWriter, PostgresManifestWriter


@dataclass(frozen=True)
class RetentionPolicy:
    source_key: str
    source_system: str
    source_table: str
    record_kind: str
    hot_days: int | None
    archive_years: int | None
    archive_required: bool
    retain_if_only_outcome_evidence: bool

    @property
    def permanent(self) -> bool:
        return self.hot_days is None


@dataclass(frozen=True)
class RetentionTableSpec:
    id_column: str
    date_column: str
    payload_column: str
    content_hash_column: str | None = None
    source_url_column: str | None = None


@dataclass(frozen=True)
class ArchiveRecord:
    source_table: str
    record_id: str
    observed_at: datetime | None
    payload: Any
    content_hash: str
    source_url: str | None = None


@dataclass(frozen=True)
class RetentionPlanItem:
    source_key: str
    source_table: str
    cutoff: date | None
    records_eligible: int
    estimated_payload_bytes: int
    period_start: datetime | None
    period_end: datetime | None
    archive_required: bool
    permanent: bool


TABLE_SPECS: dict[str, RetentionTableSpec] = {
    "raw_source_transaction_versions": RetentionTableSpec("id", "observed_at", "payload", "payload_hash"),
    "procurement_process_releases": RetentionTableSpec("id", "fetched_at", "payload", "payload_hash", "source_url"),
    "procurement_notices": RetentionTableSpec("id", "fetched_at", "payload", "payload_hash", "source_url"),
    "business_license_versions": RetentionTableSpec("id", "collected_at", "raw_payload", "content_hash", "source_url"),
    "development_permit_versions": RetentionTableSpec("id", "collected_at", "raw_payload", "content_hash", "source_url"),
    "establishment_event_evidence": RetentionTableSpec("id", "collected_at", "raw_payload", "content_hash", "source_url"),
    "company_event_sources": RetentionTableSpec("id", "collected_at", "raw_payload", "content_hash", "original_url"),
}


def calculate_cutoff(as_of: date, hot_days: int | None) -> date | None:
    return None if hot_days is None else as_of - timedelta(days=hot_days)


def record_is_eligible(observed_at: datetime | date, *, as_of: date, hot_days: int | None) -> bool:
    cutoff = calculate_cutoff(as_of, hot_days)
    if cutoff is None:
        return False
    observed_date = observed_at.date() if isinstance(observed_at, datetime) else observed_at
    return observed_date < cutoff


def build_object_key(source_system: str, archived_at: datetime, digest: str) -> str:
    safe_source = re.sub(r"[^a-z0-9._/-]+", "-", source_system.casefold()).strip("-./") or "unknown"
    return f"raw/{safe_source}/{archived_at:%Y/%m/%d}/{safe_source}-{archived_at:%Y%m%dT%H%M%SZ}-{digest[:12]}.jsonl.gz"


class ArchiveCoordinator:
    """Uploads, independently verifies, then commits a manifest.

    This class never deletes or clears a PostgreSQL payload. Pruning is a
    separate future operation and can only consider verified manifest items.
    """

    def __init__(self, backend: ArchiveBackend, manifest_writer: ManifestWriter):
        self.backend = backend
        self.manifest_writer = manifest_writer

    def archive(
        self,
        *,
        source_system: str,
        records: Sequence[ArchiveRecord],
        parser_version: str | None = None,
        schema_version: str = "businesscurrent-archive-v1",
        archived_at: datetime | None = None,
    ) -> dict[str, Any]:
        if not records:
            raise ValueError("at least one archive record is required")
        archived_at = archived_at or datetime.now(timezone.utc)
        lines = [
            json.dumps(
                {
                    "source_table": record.source_table,
                    "source_record_id": record.record_id,
                    "observed_at": record.observed_at.isoformat() if record.observed_at else None,
                    "content_hash": record.content_hash,
                    "source_url": record.source_url,
                    "payload": record.payload,
                },
                sort_keys=True,
                separators=(",", ":"),
                default=str,
            ).encode("utf-8")
            for record in records
        ]
        uncompressed = b"\n".join(lines) + b"\n"
        compressed = gzip.compress(uncompressed, compresslevel=9, mtime=0)
        digest = hashlib.sha256(compressed).hexdigest()
        object_key = build_object_key(source_system, archived_at, digest)
        receipt = self.backend.put(
            object_key,
            compressed,
            content_type="application/x-ndjson",
            sha256=digest,
        )
        independently_read = self.backend.read(object_key, object_version=receipt.object_version)
        verified_digest = hashlib.sha256(independently_read).hexdigest()
        if verified_digest != digest:
            raise ValueError("archive checksum verification failed after upload")
        observed = [record.observed_at for record in records if record.observed_at is not None]
        manifest = ArchiveManifest(
            source_system=source_system,
            object_key=object_key,
            object_version=receipt.object_version,
            etag=receipt.etag,
            content_type="application/x-ndjson",
            compression_type="gzip",
            sha256=digest,
            compressed_bytes=len(compressed),
            uncompressed_bytes=len(uncompressed),
            source_url=next((record.source_url for record in records if record.source_url), None),
            source_period_start=min(observed) if observed else None,
            source_period_end=max(observed) if observed else None,
            fetched_at=max(observed) if observed else None,
            archived_at=archived_at,
            parser_version=parser_version,
            schema_version=schema_version,
            record_count=len(records),
            verification_status="verified",
        )
        items = [
            ArchiveManifestItem(
                source_table=record.source_table,
                source_record_id=record.record_id,
                source_date=record.observed_at,
                content_hash=record.content_hash,
                archive_object_key=object_key,
            )
            for record in records
        ]
        archive_id = self.manifest_writer.write(manifest, items)
        return {"archive_id": archive_id, **asdict(manifest)}


class RetentionService:
    def __init__(self, connection, backend: ArchiveBackend | None = None):
        self.connection = connection
        self.backend = backend

    def policies(self) -> list[RetentionPolicy]:
        rows = self.connection.execute(
            """SELECT source_key,source_system,source_table,record_kind,hot_days,archive_years,
                      archive_required,retain_if_only_outcome_evidence
               FROM source_retention_policies WHERE enabled ORDER BY source_key"""
        ).fetchall()
        return [RetentionPolicy(**dict(row)) for row in rows]

    def plan(self, *, as_of: date | None = None) -> list[RetentionPlanItem]:
        as_of = as_of or date.today()
        planned: list[RetentionPlanItem] = []
        for policy in self.policies():
            cutoff = calculate_cutoff(as_of, policy.hot_days)
            spec = TABLE_SPECS.get(policy.source_table)
            if cutoff is None or spec is None:
                planned.append(RetentionPlanItem(
                    policy.source_key, policy.source_table, cutoff, 0, 0, None, None,
                    policy.archive_required, policy.permanent,
                ))
                continue
            statement = sql.SQL(
                """SELECT count(*)::bigint AS records_eligible,
                          COALESCE(sum(pg_column_size({payload})),0)::bigint AS estimated_payload_bytes,
                          min({observed}) AS period_start,max({observed}) AS period_end
                   FROM {table} source
                   WHERE {observed} < %s
                     AND NOT EXISTS (
                       SELECT 1 FROM raw_source_archive_items item
                       WHERE item.source_table=%s AND item.source_record_id=source.{id}::text
                     )"""
            ).format(
                payload=sql.Identifier(spec.payload_column), observed=sql.Identifier(spec.date_column),
                table=sql.Identifier(policy.source_table), id=sql.Identifier(spec.id_column),
            )
            row = dict(self.connection.execute(statement, (cutoff, policy.source_table)).fetchone())
            planned.append(RetentionPlanItem(
                policy.source_key, policy.source_table, cutoff, int(row["records_eligible"] or 0),
                int(row["estimated_payload_bytes"] or 0), row["period_start"], row["period_end"],
                policy.archive_required, False,
            ))
        return planned

    def archive(self, source_key: str, *, limit: int = 1000, as_of: date | None = None) -> dict[str, Any]:
        if self.backend is None:
            raise ValueError("an archive backend is required for retention-archive")
        policy = next((item for item in self.policies() if item.source_key == source_key), None)
        if policy is None:
            raise ValueError(f"unknown or disabled retention policy: {source_key}")
        if policy.permanent:
            raise ValueError(f"retention policy {source_key} is permanent and cannot be archived")
        spec = TABLE_SPECS.get(policy.source_table)
        if spec is None:
            raise ValueError(f"retention policy {source_key} has no archive adapter")
        cutoff = calculate_cutoff(as_of or date.today(), policy.hot_days)
        hash_expression = (
            sql.SQL("source.{column}::text").format(column=sql.Identifier(spec.content_hash_column))
            if spec.content_hash_column
            else sql.SQL("encode(digest(source.{column}::text,'sha256'),'hex')").format(column=sql.Identifier(spec.payload_column))
        )
        url_expression = (
            sql.SQL("source.{column}::text").format(column=sql.Identifier(spec.source_url_column))
            if spec.source_url_column else sql.SQL("NULL::text")
        )
        statement = sql.SQL(
            """SELECT source.{id}::text AS record_id,source.{observed} AS observed_at,
                      source.{payload} AS payload,{content_hash} AS content_hash,{source_url} AS source_url
               FROM {table} source
               WHERE source.{observed} < %s
                 AND NOT EXISTS (
                   SELECT 1 FROM raw_source_archive_items item
                   WHERE item.source_table=%s AND item.source_record_id=source.{id}::text
                 )
               ORDER BY source.{observed},source.{id}
               LIMIT %s"""
        ).format(
            id=sql.Identifier(spec.id_column), observed=sql.Identifier(spec.date_column),
            payload=sql.Identifier(spec.payload_column), content_hash=hash_expression,
            source_url=url_expression, table=sql.Identifier(policy.source_table),
        )
        rows = self.connection.execute(statement, (cutoff, policy.source_table, max(1, min(limit, 10_000)))).fetchall()
        records = [ArchiveRecord(
            source_table=policy.source_table, record_id=str(row["record_id"]), observed_at=row["observed_at"],
            payload=row["payload"], content_hash=str(row["content_hash"]), source_url=row["source_url"],
        ) for row in rows]
        if not records:
            return {"source_key": source_key, "archived_records": 0, "message": "No eligible unarchived records."}
        result = ArchiveCoordinator(self.backend, PostgresManifestWriter(self.connection)).archive(
            source_system=policy.source_system, records=records,
        )
        return {"source_key": source_key, "archived_records": len(records), **result}


def resolve_archive_pointer(backend: ArchiveBackend, object_key: str, sha256: str, *, object_version: str | None = None) -> bytes:
    content = backend.read(object_key, object_version=object_version)
    if hashlib.sha256(content).hexdigest() != sha256:
        raise ValueError("archive pointer resolved to content with a mismatched checksum")
    return content
