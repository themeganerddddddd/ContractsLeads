from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CapacityThresholds:
    capacity_bytes: int | None
    warning_fraction: float = 0.60
    stop_fraction: float = 0.72
    critical_fraction: float = 0.90

    @classmethod
    def from_env(cls) -> "CapacityThresholds":
        raw_capacity = os.getenv("DATABASE_CAPACITY_BYTES", "").strip()
        capacity = int(raw_capacity) if raw_capacity else None
        warning = float(os.getenv("DATABASE_CAPACITY_WARNING_FRACTION", "0.60"))
        stop = float(os.getenv("DATABASE_CAPACITY_STOP_FRACTION", "0.72"))
        critical = float(os.getenv("DATABASE_CAPACITY_CRITICAL_FRACTION", "0.90"))
        if capacity is not None and capacity <= 0:
            raise ValueError("DATABASE_CAPACITY_BYTES must be positive")
        if not (0 < warning < stop < critical <= 1):
            raise ValueError("capacity fractions must satisfy 0 < warning < stop < critical <= 1")
        return cls(capacity, warning, stop, critical)


class CapacityStop(RuntimeError):
    def __init__(self, report: dict[str, Any]):
        self.report = report
        super().__init__(
            f"capacity guard stopped {report['operation']}: {report['decision']} at "
            f"{report.get('utilization_percent', 'unknown')}% utilization"
        )


class CapacityGuard:
    """Measure Postgres storage and make an auditable go/warn/stop decision.

    Historical operations fail closed if capacity is not configured. Routine
    incremental collection is allowed until the separately configured critical
    threshold so the live feeds do not silently stop at the historical buffer.
    """

    def __init__(self, connection, thresholds: CapacityThresholds | None = None):
        self.connection = connection
        self.thresholds = thresholds or CapacityThresholds.from_env()

    def _relations(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """SELECT c.relname AS name,
                      pg_relation_size(c.oid)::bigint AS data_bytes,
                      pg_indexes_size(c.oid)::bigint AS index_bytes,
                      pg_total_relation_size(c.oid)::bigint AS total_bytes
               FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relkind IN ('r','p')
               ORDER BY pg_total_relation_size(c.oid) DESC"""
        ).fetchall()
        return [dict(row) for row in rows]

    def _counts(self) -> dict[str, int]:
        row = self.connection.execute(
            """SELECT
                 (SELECT count(*) FROM companies) AS companies,
                 (SELECT count(*) FROM awards) AS awards,
                 (SELECT count(*) FROM transactions) AS transactions,
                 (SELECT count(*) FROM raw_source_transactions) AS raw_source_records,
                 (SELECT count(*) FROM procurement_processes) AS procurement_processes,
                 (SELECT count(*) FROM procurement_process_releases) AS procurement_releases,
                 (SELECT count(*) FROM procurement_notices) AS procurement_notices,
                 (SELECT count(*) FROM procurement_events) AS events,
                 (SELECT count(*) FROM predictions) AS predictions"""
        ).fetchone()
        return {name: int(value or 0) for name, value in dict(row).items()}

    def measure(self) -> dict[str, Any]:
        database_bytes = int(
            self.connection.execute("SELECT pg_database_size(current_database()) AS bytes").fetchone()["bytes"]
        )
        relations = self._relations()
        counts = self._counts()
        table_data_bytes = sum(int(row["data_bytes"]) for row in relations)
        index_bytes = sum(int(row["index_bytes"]) for row in relations)
        relation_total_bytes = sum(int(row["total_bytes"]) for row in relations)
        raw_names = {
            "raw_source_transactions",
            "raw_source_transaction_versions",
            "procurement_process_releases",
            "procurement_notices",
        }
        raw_bytes = sum(int(row["total_bytes"]) for row in relations if row["name"] in raw_names)
        capacity = self.thresholds.capacity_bytes
        utilization = database_bytes / capacity if capacity else None
        relation_lookup = {row["name"]: int(row["total_bytes"]) for row in relations}
        observed_bytes_per_100k = {
            label: round(relation_lookup.get(table, 0) * 100_000 / counts[count_key])
            if counts[count_key]
            else None
            for label, table, count_key in (
                ("transactions", "transactions", "transactions"),
                ("awards", "awards", "awards"),
                ("procurement_events", "procurement_events", "events"),
            )
        }
        return {
            "database_bytes": database_bytes,
            "table_data_bytes": table_data_bytes,
            "index_bytes": index_bytes,
            "relation_total_bytes": relation_total_bytes,
            "capacity_bytes": capacity,
            "utilization": utilization,
            "utilization_percent": round(utilization * 100, 3) if utilization is not None else None,
            "raw_bytes": raw_bytes,
            "raw_share_percent": round(raw_bytes / database_bytes * 100, 3) if database_bytes else 0,
            "counts": counts,
            "observed_relation_bytes_per_100k": observed_bytes_per_100k,
            "relations": relations,
        }

    def check(
        self,
        *,
        source_system: str | None,
        operation: str,
        chunk_key: str | None = None,
        historical: bool = True,
        metadata: dict[str, Any] | None = None,
        raise_on_stop: bool = True,
    ) -> dict[str, Any]:
        report = self.measure()
        utilization = report["utilization"]
        if utilization is None:
            decision = "stop" if historical else "unconfigured"
            reason = "DATABASE_CAPACITY_BYTES is required for historical writes" if historical else "capacity is not configured"
        else:
            threshold = self.thresholds.stop_fraction if historical else self.thresholds.critical_fraction
            if utilization >= threshold:
                decision, reason = "stop", f"utilization reached the {threshold:.1%} stop threshold"
            elif utilization >= self.thresholds.warning_fraction:
                decision, reason = "warning", f"utilization reached the {self.thresholds.warning_fraction:.1%} warning threshold"
            else:
                decision, reason = "safe", "capacity is below the warning threshold"
        report.update(
            {
                "source_system": source_system,
                "operation": operation,
                "chunk_key": chunk_key,
                "historical": historical,
                "decision": decision,
                "reason": reason,
                "warning_threshold": self.thresholds.warning_fraction,
                "stop_threshold": self.thresholds.stop_fraction if historical else self.thresholds.critical_fraction,
            }
        )
        table_bytes = {row["name"]: row["total_bytes"] for row in report["relations"][:30]}
        try:
            self.connection.execute(
                """INSERT INTO capacity_observations (
                     source_system,operation,chunk_key,database_bytes,capacity_bytes,utilization,
                     warning_threshold,stop_threshold,decision,table_bytes,metadata
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)""",
                (
                    source_system,
                    operation,
                    chunk_key,
                    report["database_bytes"],
                    report["capacity_bytes"],
                    report["utilization"],
                    report["warning_threshold"],
                    report["stop_threshold"],
                    "unconfigured" if decision == "stop" and utilization is None else decision,
                    json.dumps(table_bytes),
                    json.dumps({"reason": reason, **(metadata or {})}),
                ),
            )
            self.connection.commit()
        except Exception:
            self.connection.rollback()
        if decision == "stop" and raise_on_stop:
            raise CapacityStop(report)
        return report

