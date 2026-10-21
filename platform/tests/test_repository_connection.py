from __future__ import annotations

import psycopg

from ingestion.repository import PostgresRepository


class FakeConnection:
    def __init__(self):
        self.closed = False
        self.broken = False
        self.commits = 0
        self.rollbacks = 0

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True


def test_repository_reconnects_at_next_transaction_boundary(monkeypatch):
    first = FakeConnection()
    replacement = FakeConnection()
    connections = iter([first, replacement])
    connect_calls = []

    def connect(database_url, **kwargs):
        connect_calls.append((database_url, kwargs))
        return next(connections)

    monkeypatch.setattr(psycopg, "connect", connect)
    repository = PostgresRepository("postgresql://example.invalid/database")

    try:
        with repository.transaction():
            first.closed = True
            first.broken = True
            raise psycopg.OperationalError("connection is closed")
    except psycopg.OperationalError:
        pass

    with repository.transaction():
        pass

    assert repository.connection is replacement
    assert first.rollbacks == 0
    assert replacement.commits == 1
    assert len(connect_calls) == 2
