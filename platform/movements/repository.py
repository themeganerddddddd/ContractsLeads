from __future__ import annotations

import json
import hashlib
from datetime import date
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .models import CompanyMatch, NormalizedMovement


class MovementRepository:
    def __init__(self, database_url: str):
        self.connection = psycopg.connect(database_url, row_factory=dict_row)

    def close(self) -> None:
        self.connection.close()

    def start_source_sync(self, source_system: str, checkpoint_key: str) -> None:
        self.connection.execute(
            """INSERT INTO source_checkpoints (source_system,checkpoint_key,status)
               VALUES (%s,%s,'running') ON CONFLICT (source_system,checkpoint_key) DO UPDATE SET
               status='running',error_summary=NULL,updated_at=now()""",
            (source_system, checkpoint_key),
        )
        self.connection.execute(
            "UPDATE data_sources SET last_attempt_at=now() WHERE source_system=%s",
            (source_system,),
        )
        self.connection.commit()

    def finish_source_sync(
        self,
        source_system: str,
        checkpoint_key: str,
        status: str,
        stats: dict[str, Any],
        *,
        checkpoint_value: str | None = None,
        error_summary: str | None = None,
    ) -> None:
        self.connection.execute(
            """UPDATE source_checkpoints SET checkpoint_value=%s,status=%s,records_seen=%s,
               records_written=%s,error_summary=%s,metadata=%s::jsonb,updated_at=now()
               WHERE source_system=%s AND checkpoint_key=%s""",
            (
                checkpoint_value,
                status,
                stats.get("received", 0),
                stats.get("written", 0),
                error_summary,
                json.dumps(stats),
                source_system,
                checkpoint_key,
            ),
        )
        self.connection.execute(
            """UPDATE data_sources SET quality_status=%s,last_record_count=%s,
               last_success_at=CASE WHEN %s='success' THEN now() ELSE last_success_at END,
               updated_at=now() WHERE source_system=%s""",
            (
                "healthy" if status == "success" else "partial" if status == "partial" else "degraded",
                stats.get("received", 0),
                status,
                source_system,
            ),
        )
        self.connection.commit()

    def source_checkpoint(self, source_system: str, checkpoint_key: str = "current") -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM source_checkpoints WHERE source_system=%s AND checkpoint_key=%s",
            (source_system, checkpoint_key),
        ).fetchone()
        return dict(row) if row else None

    def upsert_permit(self, permit: dict[str, Any]) -> dict[str, Any]:
        try:
            row = self.connection.execute(
                """INSERT INTO development_permits (
                     permit_fingerprint,source_system,source_document_id,permit_number,jurisdiction,parcel_identifier,
                     address_line,city,county,county_fips,state_code,postal_code,country_code,permit_type,work_type,
                     use_code,description,application_date,issue_date,final_date,status,project_value,currency,
                     building_area,applicant,contractor,developer,property_owner,verified_occupant,latitude,longitude,
                     relevance_score,relevance_classification,source_url,content_hash,raw_payload,
                     first_observed_at,last_observed_at
                   ) VALUES (
                     %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                     %s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s
                   ) ON CONFLICT (permit_fingerprint) DO UPDATE SET
                     address_line=EXCLUDED.address_line,city=EXCLUDED.city,county=EXCLUDED.county,
                     county_fips=EXCLUDED.county_fips,state_code=EXCLUDED.state_code,postal_code=EXCLUDED.postal_code,
                     permit_type=EXCLUDED.permit_type,work_type=EXCLUDED.work_type,use_code=EXCLUDED.use_code,
                     description=EXCLUDED.description,application_date=EXCLUDED.application_date,
                     issue_date=EXCLUDED.issue_date,final_date=EXCLUDED.final_date,status=EXCLUDED.status,
                     project_value=EXCLUDED.project_value,currency=EXCLUDED.currency,building_area=EXCLUDED.building_area,
                     latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,relevance_score=EXCLUDED.relevance_score,
                     relevance_classification=EXCLUDED.relevance_classification,source_url=EXCLUDED.source_url,
                     content_hash=EXCLUDED.content_hash,raw_payload=EXCLUDED.raw_payload,
                     last_observed_at=greatest(development_permits.last_observed_at,EXCLUDED.last_observed_at),updated_at=now()
                   RETURNING id::text,(xmax=0) AS inserted""",
                (
                    permit["permit_fingerprint"], permit["source_system"], permit["source_document_id"],
                    permit["permit_number"], permit["jurisdiction"], permit.get("parcel_identifier"),
                    permit.get("address_line"), permit.get("city"), permit.get("county"), permit.get("county_fips"),
                    permit.get("state_code"), permit.get("postal_code"), permit["country_code"], permit.get("permit_type"),
                    permit.get("work_type"), permit.get("use_code"), permit.get("description"),
                    permit.get("application_date"), permit.get("issue_date"), permit.get("final_date"), permit.get("status"),
                    permit.get("project_value"), permit.get("currency"), permit.get("building_area"),
                    permit.get("applicant"), permit.get("contractor"), permit.get("developer"),
                    permit.get("property_owner"), permit.get("verified_occupant"), permit.get("latitude"),
                    permit.get("longitude"), permit["relevance_score"], permit["relevance_classification"],
                    permit["source_url"], permit["content_hash"], json.dumps(permit.get("raw_payload") or {}, default=str),
                    permit["first_observed_at"], permit["last_observed_at"],
                ),
            ).fetchone()
            self.connection.execute(
                """INSERT INTO development_permit_versions (
                     permit_id,source_record_fingerprint,content_hash,source_url,collected_at,raw_payload
                   ) VALUES (%s,%s,%s,%s,%s,%s::jsonb)
                   ON CONFLICT (source_record_fingerprint) DO NOTHING""",
                (
                    row["id"], permit["source_record_fingerprint"], permit["content_hash"], permit["source_url"],
                    permit["last_observed_at"], json.dumps(permit.get("raw_payload") or {}, default=str),
                ),
            )
            self.connection.commit()
            return {"id": row["id"], "inserted": bool(row["inserted"])}
        except Exception:
            self.connection.rollback()
            raise

    def company_candidates(self, observed_name: str | None, *, limit: int = 20) -> list[dict[str, Any]]:
        if not observed_name:
            return []
        rows = self.connection.execute(
            """SELECT id::text,canonical_name,legal_name,uei,cage_code,
               greatest(similarity(canonical_name,%s),similarity(legal_name,%s)) AS name_similarity
               FROM companies
               WHERE NOT is_benchmark AND (
                 lower(canonical_name)=lower(%s) OR lower(legal_name)=lower(%s)
                 OR similarity(canonical_name,%s) >= 0.30 OR similarity(legal_name,%s) >= 0.30
               )
               ORDER BY name_similarity DESC,canonical_name LIMIT %s""",
            (observed_name, observed_name, observed_name, observed_name, observed_name, observed_name, limit),
        ).fetchall()
        return [dict(row) for row in rows]

    def company_by_identifier(self, system: str, value: str, country_code: str | None = None) -> dict[str, Any] | None:
        rows = self.connection.execute(
            """SELECT c.id::text,c.canonical_name,c.legal_name,c.uei,c.cage_code
               FROM entity_identifiers ei JOIN companies c ON c.id=ei.company_id
               WHERE upper(ei.identifier_system)=upper(%s) AND upper(ei.identifier_value)=upper(%s)
                 AND ei.is_verified AND (%s::text IS NULL OR ei.country_code=%s OR ei.country_code IS NULL)
                 AND NOT c.is_benchmark ORDER BY ei.observed_at DESC LIMIT 2""",
            (system, value, country_code, country_code),
        ).fetchall()
        return dict(rows[0]) if len(rows) == 1 else None

    def sec_targets(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """SELECT DISTINCT ON (c.id) c.id::text AS company_id,c.canonical_name,
               lpad(regexp_replace(ei.identifier_value,'[^0-9]','','g'),10,'0') AS cik
               FROM entity_identifiers ei JOIN companies c ON c.id=ei.company_id
               WHERE upper(ei.identifier_system) IN ('SEC_CIK','CIK') AND ei.is_verified
                 AND ei.identifier_value ~ '[0-9]' AND NOT c.is_benchmark
               ORDER BY c.id,ei.observed_at DESC"""
        ).fetchall()
        return [dict(row) for row in rows]

    def movement_indicators_for_company(self, company_id: str, as_of_date: date) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """SELECT id::text,indicator_fingerprint,company_id::text,event_id::text,permit_id::text,
               source_system,as_of_date::text,observed_at,indicator_type,direction,value::text,country_code,
               state_code,county_fips,city,strength::text,reliability::text,confidence::text,
               associated_event_ids,evidence
               FROM movement_indicators WHERE company_id=%s AND observed_at < (%s::date + interval '1 day')
               ORDER BY observed_at""",
            (company_id, as_of_date),
        ).fetchall()
        return [dict(row) for row in rows]

    def indicator_company_ids(self) -> list[str]:
        return [
            row["company_id"]
            for row in self.connection.execute(
                "SELECT DISTINCT company_id::text FROM movement_indicators ORDER BY company_id::text"
            ).fetchall()
        ]

    def persist_movement_assessment(self, assessment: dict[str, Any]) -> bool:
        row = self.connection.execute(
            """INSERT INTO movement_assessments (
                 assessment_fingerprint,company_id,assessment_type,as_of_date,prediction_horizon_days,
                 country_code,state_code,county_fips,city,score,evidence_quality,data_sufficiency,
                 model_version,components,evidence_event_ids,explanation
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s)
               ON CONFLICT (assessment_fingerprint) DO NOTHING RETURNING id""",
            (
                assessment["assessment_fingerprint"], assessment["company_id"], assessment["assessment_type"],
                assessment["as_of_date"], assessment.get("prediction_horizon_days"), assessment.get("country_code"),
                assessment.get("state_code"), assessment.get("county_fips"), assessment.get("city"),
                assessment.get("score"), assessment["evidence_quality"], assessment["data_sufficiency"],
                assessment["model_version"], json.dumps(assessment["components"], default=str),
                assessment["evidence_event_ids"], assessment["explanation"],
            ),
        ).fetchone()
        self.connection.commit()
        return bool(row)

    def persist(self, movement: NormalizedMovement, match: CompanyMatch) -> dict[str, Any]:
        event = movement.event
        source = movement.source
        try:
            event_row = self.connection.execute(
                """INSERT INTO company_events (
                     event_fingerprint,source_system,source_country,event_type,event_subtype,event_status,
                     verification_status,announced_date,event_date,effective_start_date,effective_end_date,title,summary,
                     employment_change,jobs_created,jobs_affected,capital_investment,currency,primary_state,
                     primary_county,primary_county_fips,primary_city,primary_postal_code,confidence,evidence,
                     first_observed_at,last_observed_at
                   ) VALUES (
                     %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s
                   ) ON CONFLICT (event_fingerprint) DO UPDATE SET
                     event_subtype=EXCLUDED.event_subtype,event_status=EXCLUDED.event_status,
                     verification_status=EXCLUDED.verification_status,announced_date=EXCLUDED.announced_date,event_date=EXCLUDED.event_date,
                     effective_start_date=EXCLUDED.effective_start_date,effective_end_date=EXCLUDED.effective_end_date,
                     title=EXCLUDED.title,summary=EXCLUDED.summary,employment_change=EXCLUDED.employment_change,
                     jobs_created=EXCLUDED.jobs_created,jobs_affected=EXCLUDED.jobs_affected,
                     capital_investment=EXCLUDED.capital_investment,currency=EXCLUDED.currency,
                     primary_state=EXCLUDED.primary_state,primary_county=EXCLUDED.primary_county,
                     primary_county_fips=EXCLUDED.primary_county_fips,primary_city=EXCLUDED.primary_city,
                     primary_postal_code=EXCLUDED.primary_postal_code,confidence=EXCLUDED.confidence,
                     evidence=EXCLUDED.evidence,last_observed_at=greatest(company_events.last_observed_at,EXCLUDED.last_observed_at),
                     updated_at=now() RETURNING id::text""",
                (
                    event["event_fingerprint"], event["source_system"], event["source_country"], event["event_type"],
                    event.get("event_subtype"), event["event_status"], event["verification_status"],
                    event.get("announced_date"), event.get("event_date"), event.get("effective_start_date"), event.get("effective_end_date"),
                    event["title"], event.get("summary"), event.get("employment_change"), event.get("jobs_created"),
                    event.get("jobs_affected"), event.get("capital_investment"), event.get("currency"),
                    event.get("primary_state"), event.get("primary_county"), event.get("primary_county_fips"),
                    event.get("primary_city"), event.get("primary_postal_code"), event["confidence"],
                    json.dumps(event.get("evidence") or {}, default=str), event["first_observed_at"], event["last_observed_at"],
                ),
            ).fetchone()
            event_id = event_row["id"]
            source_row = self.connection.execute(
                """INSERT INTO company_event_sources (
                     event_id,source_record_fingerprint,source_system,document_identifier,content_hash,original_url,
                     publisher,publication_date,collected_at,source_type,record_status,is_primary,evidence_excerpt,
                     raw_payload,license_name,commercial_use_status
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s)
                   ON CONFLICT (source_record_fingerprint) DO UPDATE SET event_id=EXCLUDED.event_id
                   RETURNING id::text""",
                (
                    event_id, source["source_record_fingerprint"], source["source_system"],
                    source["document_identifier"], source["content_hash"], source["original_url"], source["publisher"],
                    source.get("publication_date"), source["collected_at"], source["source_type"], source["record_status"],
                    source.get("is_primary", True), source.get("evidence_excerpt"),
                    json.dumps(source.get("raw_payload") or {}, default=str), source.get("license_name"),
                    source.get("commercial_use_status", "unverified"),
                ),
            ).fetchone()
            source_id = source_row["id"]
            if movement.location:
                location = movement.location
                self.connection.execute(
                    """INSERT INTO company_event_locations (
                         location_fingerprint,event_id,location_role,address_line,city,county,county_fips,state_code,
                         postal_code,country_code,is_primary,confidence,evidence
                       ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
                       ON CONFLICT (location_fingerprint) DO UPDATE SET
                         address_line=EXCLUDED.address_line,city=EXCLUDED.city,county=EXCLUDED.county,
                         county_fips=EXCLUDED.county_fips,state_code=EXCLUDED.state_code,
                         postal_code=EXCLUDED.postal_code,confidence=EXCLUDED.confidence,evidence=EXCLUDED.evidence""",
                    (
                        location["location_fingerprint"], event_id, location["location_role"], location.get("address_line"),
                        location.get("city"), location.get("county"), location.get("county_fips"), location.get("state_code"),
                        location.get("postal_code"), location["country_code"], location.get("is_primary", False),
                        location["confidence"], json.dumps(location.get("evidence") or {}, default=str),
                    ),
                )
            if match.company:
                identifier_verified = match.method in {"sec_cik", "uei", "cage_code"}
                review_status = "auto_verified" if identifier_verified else "pending"
                self.connection.execute(
                    """INSERT INTO company_event_companies (
                         event_id,company_id,observed_company_name,relationship_type,is_primary,matching_method,
                         matching_confidence,matching_evidence,review_status
                       ) VALUES (%s,%s,%s,'subject',true,%s,%s,%s::jsonb,%s)
                       ON CONFLICT (event_id,company_id,relationship_type) DO UPDATE SET
                         observed_company_name=EXCLUDED.observed_company_name,matching_method=EXCLUDED.matching_method,
                         matching_confidence=EXCLUDED.matching_confidence,matching_evidence=EXCLUDED.matching_evidence""",
                    (
                        event_id, match.company["id"], movement.observed_company_name, match.method, match.confidence,
                        json.dumps({"rule": match.method, "requires_review": not identifier_verified}), review_status,
                    ),
                )
                self._persist_review(
                    source_id,
                    movement.observed_company_name,
                    match.company,
                    "approved" if identifier_verified else "pending",
                    match,
                )
                if identifier_verified:
                    self._persist_event_indicator(event_id, event, match.company["id"])
            elif match.candidates:
                for candidate in match.candidates:
                    self._persist_review(source_id, movement.observed_company_name, candidate, "ambiguous", match)
            else:
                self._persist_review(source_id, movement.observed_company_name, None, "unmatched", match)
            self.connection.commit()
            return {"event_id": event_id, "source_id": source_id, "match_status": match.status}
        except Exception:
            self.connection.rollback()
            raise

    def _persist_event_indicator(self, event_id: str, event: dict[str, Any], company_id: str) -> None:
        positive = {
            "expansion", "facility_expansion", "new_facility", "opening", "hiring", "investment", "funding", "market_entry"
        }
        negative = {"layoff", "closure", "furlough", "bankruptcy", "restructuring"}
        direction = "positive" if event["event_type"] in positive else "negative" if event["event_type"] in negative else "neutral"
        value = event.get("capital_investment") or event.get("jobs_created") or event.get("jobs_affected")
        fingerprint = hashlib.sha256(
            f"event|{event['event_fingerprint']}|{company_id}".encode("utf-8")
        ).hexdigest()
        self.connection.execute(
            """INSERT INTO movement_indicators (
                 indicator_fingerprint,company_id,event_id,source_system,as_of_date,observed_at,indicator_type,
                 direction,value,country_code,state_code,county_fips,city,strength,reliability,confidence,
                 associated_event_ids,evidence
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
               ON CONFLICT (indicator_fingerprint) DO NOTHING""",
            (
                fingerprint, company_id, event_id, event["source_system"],
                event.get("event_date") or event.get("effective_start_date") or event.get("announced_date"),
                event["first_observed_at"], event["event_type"], direction, value, event.get("source_country"),
                event.get("primary_state"), event.get("primary_county_fips"), event.get("primary_city"),
                event["confidence"], 1.0 if event["verification_status"] == "source_verified" else event["confidence"],
                event["confidence"], [event_id], json.dumps({"event_fingerprint": event["event_fingerprint"]}),
            ),
        )

    def _persist_review(
        self,
        source_id: str,
        observed_name: str | None,
        candidate: dict[str, Any] | None,
        status: str,
        match: CompanyMatch,
    ) -> None:
        evidence = {
            "candidate_name": candidate.get("canonical_name") if candidate else None,
            "candidate_uei": candidate.get("uei") if candidate else None,
            "automatic_link": bool(match.company),
        }
        if candidate:
            self.connection.execute(
                """INSERT INTO company_match_reviews (
                     source_id,observed_company_name,candidate_company_id,match_status,matching_method,confidence,evidence
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb)
                   ON CONFLICT (source_id,candidate_company_id) DO UPDATE SET
                     match_status=EXCLUDED.match_status,matching_method=EXCLUDED.matching_method,
                     confidence=EXCLUDED.confidence,evidence=EXCLUDED.evidence""",
                (source_id, observed_name or "Unknown", candidate["id"], status, match.method, match.confidence, json.dumps(evidence)),
            )
        else:
            self.connection.execute(
                """INSERT INTO company_match_reviews (
                     source_id,observed_company_name,candidate_company_id,match_status,matching_method,confidence,evidence
                   ) VALUES (%s,%s,NULL,%s,%s,%s,%s::jsonb)
                   ON CONFLICT (source_id) WHERE candidate_company_id IS NULL DO UPDATE SET
                     observed_company_name=EXCLUDED.observed_company_name,match_status=EXCLUDED.match_status,
                     matching_method=EXCLUDED.matching_method,confidence=EXCLUDED.confidence,evidence=EXCLUDED.evidence""",
                (source_id, observed_name or "Unknown", status, match.method, match.confidence, json.dumps(evidence)),
            )
