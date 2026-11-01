from __future__ import annotations

import hashlib
from datetime import date

import pytest

from archive.backend import ArchiveReceipt, LocalArchiveBackend
from archive.features import FeatureExportService


class FakeResult:
    def __init__(self, rows): self.rows = rows
    def fetchone(self): return self.rows[0]
    def fetchall(self): return self.rows


class FakeConnection:
    def __init__(self, rows):
        self.rows = rows
        self.writes = []
        self.committed = False

    def execute(self, statement, params=None):
        query = str(statement)
        if query.startswith("INSERT INTO feature_exports"):
            self.writes.append((query, params))
            return FakeResult([])
        if "count(*)" in query:
            return FakeResult([{"row_count": len(self.rows)}])
        return FakeResult(self.rows)

    def commit(self): self.committed = True


class CorruptBackend:
    def put(self, object_key, content, *, content_type, sha256):
        return ArchiveReceipt(object_key, sha256, None, len(content))

    def read(self, object_key, *, object_version=None): return b"corrupt"


def encoded(rows):
    return ("PAR1" + repr(rows)).encode()


def test_feature_export_uploads_verifies_and_records_manifest(tmp_path):
    rows = [{"company_id": "c1", "month": date(2026, 1, 1), "award_count": 2}]
    connection = FakeConnection(rows)
    result = FeatureExportService(connection, LocalArchiveBackend(tmp_path), encoder=encoded).export(
        "company_monthly_features", 2026
    )

    assert result["verification_status"] == "verified"
    assert result["object_key"].startswith("features/company_monthly_features/year=2026/")
    assert result["sha256"] == hashlib.sha256(encoded(rows)).hexdigest()
    assert len(connection.writes) == 1
    assert connection.committed


def test_feature_export_checksum_failure_does_not_write_manifest():
    connection = FakeConnection([{"month": date(2026, 1, 1)}])
    with pytest.raises(ValueError, match="checksum verification failed"):
        FeatureExportService(connection, CorruptBackend(), encoder=encoded).export(
            "geography_industry_monthly_features", 2026
        )
    assert connection.writes == []


def test_feature_export_rejects_unallowlisted_dataset():
    with pytest.raises(ValueError, match="unknown feature dataset"):
        FeatureExportService(FakeConnection([])).plan("users", 2026)
