from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, Sequence
from uuid import UUID


@dataclass(frozen=True)
class ArchiveManifest:
    source_system: str
    object_key: str
    object_version: str | None
    etag: str
    content_type: str
    compression_type: str
    sha256: str
    compressed_bytes: int
    uncompressed_bytes: int
    source_url: str | None
    source_period_start: datetime | None
    source_period_end: datetime | None
    fetched_at: datetime | None
    archived_at: datetime
    parser_version: str | None
    schema_version: str
    record_count: int
    verification_status: str


@dataclass(frozen=True)
class ArchiveManifestItem:
    source_table: str
    source_record_id: str
    source_date: datetime | None
    content_hash: str
    archive_object_key: str


class ManifestWriter(Protocol):
    def write(self, manifest: ArchiveManifest, items: Sequence[ArchiveManifestItem]) -> str: ...


class PostgresManifestWriter:
    def __init__(self, connection):
        self.connection = connection

    def write(self, manifest: ArchiveManifest, items: Sequence[ArchiveManifestItem]) -> str:
        row = self.connection.execute(
            """INSERT INTO raw_source_archives (
                 source_system,object_key,object_version,etag,content_type,compression_type,sha256,
                 compressed_bytes,uncompressed_bytes,source_url,source_period_start,source_period_end,
                 fetched_at,archived_at,parser_version,schema_version,record_count,verification_status
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id""",
            (
                manifest.source_system, manifest.object_key, manifest.object_version, manifest.etag,
                manifest.content_type, manifest.compression_type, manifest.sha256,
                manifest.compressed_bytes, manifest.uncompressed_bytes, manifest.source_url,
                manifest.source_period_start, manifest.source_period_end, manifest.fetched_at,
                manifest.archived_at, manifest.parser_version, manifest.schema_version,
                manifest.record_count, manifest.verification_status,
            ),
        ).fetchone()
        archive_id = str(row["id"] if isinstance(row, dict) else row[0])
        for item in items:
            self.connection.execute(
                """INSERT INTO raw_source_archive_items (
                     archive_id,source_table,source_record_id,source_date,content_hash,
                     archive_object_key,verification_status,prune_status
                   ) VALUES (%s,%s,%s,%s,%s,%s,'verified','retained')
                   ON CONFLICT (source_table,source_record_id,content_hash) DO NOTHING""",
                (
                    UUID(archive_id), item.source_table, item.source_record_id, item.source_date,
                    item.content_hash, item.archive_object_key,
                ),
            )
        self.connection.commit()
        return archive_id
