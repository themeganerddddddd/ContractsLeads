from __future__ import annotations

import pytest

from operations.capacity import CapacityGuard, CapacityStop, CapacityThresholds


class FakeResult:
    def __init__(self, rows): self.rows = rows
    def fetchone(self): return self.rows[0]
    def fetchall(self): return self.rows


class FakeConnection:
    def __init__(self, size): self.size = size
    def execute(self, sql, params=None):
        if "pg_database_size" in sql: return FakeResult([{"bytes": self.size}])
        if "pg_class" in sql: return FakeResult([{"name": "awards", "data_bytes": 10, "index_bytes": 5, "total_bytes": 15}])
        return FakeResult([])
    def commit(self): pass
    def rollback(self): pass


def test_historical_guard_warns_before_stop():
    guard = CapacityGuard(FakeConnection(650), CapacityThresholds(1000, 0.60, 0.72, 0.90))
    report = guard.check(source_system="test", operation="backfill", raise_on_stop=False)
    assert report["decision"] == "warning"


def test_historical_guard_stops_at_configured_threshold():
    guard = CapacityGuard(FakeConnection(720), CapacityThresholds(1000, 0.60, 0.72, 0.90))
    with pytest.raises(CapacityStop):
        guard.check(source_system="test", operation="backfill")


def test_historical_guard_fails_closed_without_capacity():
    guard = CapacityGuard(FakeConnection(1), CapacityThresholds(None))
    with pytest.raises(CapacityStop):
        guard.check(source_system="test", operation="backfill")
