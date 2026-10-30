from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone

import pytest

from archive.backend import ArchiveReceipt, LocalArchiveBackend
from archive.retention import (
    ArchiveCoordinator,
    ArchiveRecord,
    RetentionPolicy,
    calculate_cutoff,
    record_is_eligible,
    resolve_archive_pointer,
)


class RecordingManifestWriter:
    def __init__(self):
        self.calls = []

    def write(self, manifest, items):
        self.calls.append((manifest, list(items)))
        return "11111111-1111-1111-1111-111111111111"


class FailingUploadBackend:
    def put(self, object_key, content, *, content_type, sha256):
        raise RuntimeError("simulated upload failure")

    def read(self, object_key, *, object_version=None):
        raise AssertionError("read must not happen after upload failure")


class CorruptReadBackend:
    def put(self, object_key, content, *, content_type, sha256):
        return ArchiveReceipt(object_key, sha256, None, len(content))

    def read(self, object_key, *, object_version=None):
        return b"corrupted after upload"


def record() -> ArchiveRecord:
    return ArchiveRecord(
        source_table="business_license_versions",
        record_id="license-version-1",
        observed_at=datetime(2019, 1, 2, tzinfo=timezone.utc),
        payload={"license": "ABC-1", "status": "active"},
        content_hash="source-content-hash",
        source_url="https://example.gov/licenses/ABC-1",
    )


def test_archive_upload_verifies_checksum_then_writes_manifest(tmp_path):
    backend = LocalArchiveBackend(tmp_path)
    writer = RecordingManifestWriter()
    result = ArchiveCoordinator(backend, writer).archive(
        source_system="dc/licenses",
        records=[record()],
        archived_at=datetime(2026, 10, 28, tzinfo=timezone.utc),
    )

    assert result["verification_status"] == "verified"
    assert result["record_count"] == 1
    assert result["object_key"].startswith("raw/dc/licenses/2026/10/28/")
    assert len(writer.calls) == 1
    stored = backend.read(result["object_key"])
    assert hashlib.sha256(stored).hexdigest() == result["sha256"]


def test_failed_archive_upload_leaves_records_and_manifest_untouched():
    source_records = [record()]
    writer = RecordingManifestWriter()

    with pytest.raises(RuntimeError, match="simulated upload failure"):
        ArchiveCoordinator(FailingUploadBackend(), writer).archive(
            source_system="dc/licenses", records=source_records,
        )

    assert source_records[0].payload["status"] == "active"
    assert writer.calls == []


def test_checksum_mismatch_leaves_records_and_manifest_untouched():
    source_records = [record()]
    writer = RecordingManifestWriter()

    with pytest.raises(ValueError, match="checksum verification failed"):
        ArchiveCoordinator(CorruptReadBackend(), writer).archive(
            source_system="dc/licenses", records=source_records,
        )

    assert source_records[0].payload["license"] == "ABC-1"
    assert writer.calls == []


def test_retention_cutoff_keeps_current_detail_and_marks_expired_detail():
    as_of = date(2026, 10, 28)
    cutoff = calculate_cutoff(as_of, 1826)

    assert cutoff == date(2021, 10, 28)
    assert record_is_eligible(date(2020, 10, 27), as_of=as_of, hot_days=1826)
    assert not record_is_eligible(date(2025, 10, 27), as_of=as_of, hot_days=1826)


def test_permanent_outcomes_never_receive_a_cutoff():
    policy = RetentionPolicy(
        source_key="confirmed_business_outcomes",
        source_system="business_change",
        source_table="business_change_outcomes",
        record_kind="permanent_outcome",
        hot_days=None,
        archive_years=None,
        archive_required=False,
        retain_if_only_outcome_evidence=True,
    )

    assert policy.permanent
    assert calculate_cutoff(date(2026, 10, 28), policy.hot_days) is None
    assert not record_is_eligible(date(2010, 1, 1), as_of=date(2026, 10, 28), hot_days=policy.hot_days)


def test_archive_pointer_resolution_rechecks_checksum(tmp_path):
    backend = LocalArchiveBackend(tmp_path)
    content = b"archive-bytes"
    digest = hashlib.sha256(content).hexdigest()
    receipt = backend.put("raw/test/2026/10/28/test.bin", content, content_type="application/octet-stream", sha256=digest)

    assert resolve_archive_pointer(backend, receipt.object_key, digest) == content
    with pytest.raises(ValueError, match="mismatched checksum"):
        resolve_archive_pointer(backend, receipt.object_key, "0" * 64)
