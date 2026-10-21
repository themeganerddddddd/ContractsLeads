from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Any

import psycopg
from psycopg.rows import dict_row


class IntelligenceRepository:
    def __init__(self, database_url: str):
        self.connection = psycopg.connect(database_url, row_factory=dict_row)

    def close(self) -> None:
        self.connection.close()

    def event_bounds(self) -> tuple[date | None, date | None]:
        row = self.connection.execute(
            """SELECT min(e.event_at)::date AS start,max(e.event_at)::date AS end FROM procurement_events e
               WHERE (e.award_id IS NOT NULL AND EXISTS (
                 SELECT 1 FROM awards a WHERE a.id=e.award_id AND NOT a.is_demo AND NOT a.is_benchmark
               )) OR (e.award_id IS NULL AND e.process_id IS NOT NULL AND EXISTS (
                 SELECT 1 FROM procurement_processes p WHERE p.id=e.process_id AND NOT p.is_demo
               ))"""
        ).fetchone()
        return row["start"], row["end"]

    def candidate_ids(self, prediction_type: str) -> list[str]:
        if prediction_type == "new_award":
            return [row["id"] for row in self.connection.execute(
                """SELECT DISTINCT e.company_id::text AS id FROM procurement_events e
                   JOIN companies c ON c.id=e.company_id
                   WHERE e.company_id IS NOT NULL AND NOT c.is_demo AND NOT c.is_benchmark"""
            ).fetchall()]
        return [row["id"] for row in self.connection.execute(
            """SELECT DISTINCT 'award:' || e.award_id::text AS id FROM procurement_events e
               JOIN awards a ON a.id=e.award_id WHERE e.award_id IS NOT NULL AND NOT a.is_demo AND NOT a.is_benchmark
               UNION SELECT DISTINCT 'process:' || e.process_id::text AS id FROM procurement_events e
               JOIN procurement_processes p ON p.id=e.process_id
               WHERE e.process_id IS NOT NULL AND e.award_id IS NULL AND NOT p.is_demo"""
        ).fetchall()]

    def events_for(self, prediction_type: str, entity_id: str) -> list[dict[str, Any]]:
        if prediction_type == "new_award":
            column, value = "company_id", entity_id
        else:
            kind, value = entity_id.split(":", 1)
            column = "award_id" if kind == "award" else "process_id"
        return [dict(row) for row in self.connection.execute(
            f"""SELECT event_at,event_type,value_delta_native,value_native,buyer_id::text,company_id::text,award_id::text
                FROM procurement_events WHERE {column}=%s ORDER BY event_at""", (value,)
        ).fetchall()]

    def contract_end(self, award_id: str) -> date | None:
        kind, entity_id = award_id.split(":", 1)
        if kind == "award":
            row = self.connection.execute("SELECT end_date FROM awards WHERE id=%s", (entity_id,)).fetchone()
        else:
            row = self.connection.execute("SELECT contract_end_date AS end_date FROM procurement_processes WHERE id=%s", (entity_id,)).fetchone()
        return row["end_date"] if row else None

    def persist_model(self, model: dict[str, Any]) -> str:
        row = self.connection.execute(
            """INSERT INTO prediction_models (
                 model_type,version,algorithm,observation_start,training_end,validation_end,test_end,horizons,
                 feature_names,coefficients,intercept,sample_counts,metrics,probability_eligible,status,data_provenance,notes
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s::jsonb,%s::jsonb,%s,%s,%s::jsonb,%s)
               ON CONFLICT (model_type,version) DO NOTHING RETURNING id::text""",
            (
                model["model_type"], model["version"], model["algorithm"], model.get("observation_start"),
                model["training_end"], model.get("validation_end"), model.get("test_end"), model["horizons"],
                json.dumps(model["feature_names"]), json.dumps(model["coefficients"]), model["intercept"],
                json.dumps(model["sample_counts"]), json.dumps(model["metrics"]), model["probability_eligible"],
                model["status"], json.dumps(model["data_provenance"]), model.get("notes"),
            ),
        ).fetchone()
        if not row:
            row = self.connection.execute(
                "SELECT id::text FROM prediction_models WHERE model_type=%s AND version=%s",
                (model["model_type"], model["version"]),
            ).fetchone()
        self.connection.commit()
        return row["id"]

    def latest_model(self, prediction_type: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            """SELECT * FROM prediction_models WHERE model_type=%s
               ORDER BY probability_eligible DESC,trained_at DESC LIMIT 1""", (prediction_type,)
        ).fetchone()
        return dict(row) if row else None

    def persist_prediction(self, payload: dict[str, Any]) -> bool:
        entity_id = payload.get("company_id") or payload.get("award_id") or payload.get("process_id")
        fingerprint = hashlib.sha256(
            f"{payload['model_id']}|{payload['prediction_type']}|{payload['as_of_date']}|{payload['horizon_days']}|{entity_id}".encode("utf-8")
        ).hexdigest()
        row = self.connection.execute(
            """INSERT INTO predictions (
                 prediction_fingerprint,model_id,prediction_type,as_of_date,horizon_days,company_id,award_id,process_id,
                 probability,likelihood_band,data_sufficiency,reasons,feature_snapshot
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)
               ON CONFLICT (prediction_fingerprint) DO NOTHING RETURNING id""",
            (
                fingerprint, payload["model_id"], payload["prediction_type"], payload["as_of_date"],
                payload["horizon_days"], payload.get("company_id"), payload.get("award_id"), payload.get("process_id"),
                payload.get("probability"), payload.get("likelihood_band"), payload["data_sufficiency"],
                json.dumps(payload["reasons"]), json.dumps(payload["feature_snapshot"]),
            ),
        ).fetchone()
        self.connection.commit()
        return bool(row)

    def persist_momentum(self, company_id: str, as_of: date, snapshot: dict[str, Any]) -> bool:
        fingerprint = hashlib.sha256(f"{company_id}|{as_of}".encode("utf-8")).hexdigest()
        row = self.connection.execute(
            """INSERT INTO company_momentum (
                 momentum_fingerprint,company_id,as_of_date,score,data_sufficiency,components,explanation
               ) VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s)
               ON CONFLICT (momentum_fingerprint) DO NOTHING RETURNING id""",
            (
                fingerprint, company_id, as_of, snapshot["score"], snapshot["data_sufficiency"],
                json.dumps(snapshot["components"]), snapshot["explanation"],
            ),
        ).fetchone()
        self.connection.commit()
        return bool(row)
