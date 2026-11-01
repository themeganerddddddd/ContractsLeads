from __future__ import annotations

import json
import hashlib
from datetime import date
from typing import Any

import psycopg
from psycopg.rows import dict_row

from procurement_materiality import evaluate_award_adjustment

from .models import CompanyMatch, NormalizedMovement
from .change_intelligence import material_indication_change


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

    def upsert_business_license(self, license_record: dict[str, Any]) -> dict[str, Any]:
        """Persist a privacy-filtered license, optional establishment candidate, and signal."""
        try:
            establishment_id: str | None = None
            establishment = license_record.get("establishment")
            if establishment:
                row = self.connection.execute(
                    """INSERT INTO business_establishments (
                         establishment_fingerprint,company_id,establishment_name,establishment_type,address_line,
                         city,county,county_fips,state_code,postal_code,country_code,latitude,longitude,
                         location_precision,is_public_business_location,location_status,verified_headquarters,
                         source_system,source_url,verification_status,match_status,confidence,evidence,
                         first_observed_at,last_observed_at
                       ) VALUES (
                         %(establishment_fingerprint)s,NULL,%(establishment_name)s,%(establishment_type)s,
                         %(address_line)s,%(city)s,%(county)s,%(county_fips)s,%(state_code)s,%(postal_code)s,
                         %(country_code)s,%(latitude)s,%(longitude)s,%(location_precision)s,
                         %(is_public_business_location)s,%(location_status)s,%(verified_headquarters)s,
                         %(source_system)s,%(source_url)s,%(verification_status)s,%(match_status)s,%(confidence)s,
                         %(evidence)s::jsonb,%(first_observed_at)s,%(last_observed_at)s
                       ) ON CONFLICT (establishment_fingerprint) DO UPDATE SET
                         establishment_name=EXCLUDED.establishment_name,
                         establishment_type=EXCLUDED.establishment_type,
                         address_line=EXCLUDED.address_line,city=EXCLUDED.city,county=EXCLUDED.county,
                         county_fips=EXCLUDED.county_fips,state_code=EXCLUDED.state_code,
                         postal_code=EXCLUDED.postal_code,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
                         location_precision=EXCLUDED.location_precision,source_url=EXCLUDED.source_url,
                         evidence=business_establishments.evidence || EXCLUDED.evidence,
                         last_observed_at=greatest(business_establishments.last_observed_at,EXCLUDED.last_observed_at),
                         updated_at=now() RETURNING id::text""",
                    {**establishment, "evidence": json.dumps(establishment.get("evidence") or {}, default=str)},
                ).fetchone()
                establishment_id = row["id"]
                address_payload = {
                    key: establishment.get(key) for key in (
                        "address_line", "city", "county", "county_fips", "state_code", "postal_code",
                        "country_code", "latitude", "longitude", "location_precision",
                    )
                }
                address_fingerprint = hashlib.sha256(
                    json.dumps({"establishment_id": establishment_id, **address_payload}, sort_keys=True, default=str).encode()
                ).hexdigest()
                self.connection.execute(
                    """INSERT INTO establishment_address_history (
                         address_fingerprint,establishment_id,address_line,city,county,county_fips,state_code,
                         postal_code,country_code,latitude,longitude,location_precision,is_public_business_location,
                         first_observed_at,last_observed_at,source_system,source_url,evidence
                       ) VALUES (
                         %(address_fingerprint)s,%(establishment_id)s,%(address_line)s,%(city)s,%(county)s,
                         %(county_fips)s,%(state_code)s,%(postal_code)s,%(country_code)s,%(latitude)s,%(longitude)s,
                         %(location_precision)s,true,%(first_observed_at)s,%(last_observed_at)s,%(source_system)s,
                         %(source_url)s,%(evidence)s::jsonb
                       ) ON CONFLICT (address_fingerprint) DO UPDATE SET
                         last_observed_at=greatest(establishment_address_history.last_observed_at,EXCLUDED.last_observed_at),
                         source_url=EXCLUDED.source_url,evidence=establishment_address_history.evidence || EXCLUDED.evidence""",
                    {
                        **address_payload,
                        "address_fingerprint": address_fingerprint,
                        "establishment_id": establishment_id,
                        "first_observed_at": establishment["first_observed_at"],
                        "last_observed_at": establishment["last_observed_at"],
                        "source_system": establishment["source_system"],
                        "source_url": establishment["source_url"],
                        "evidence": json.dumps(establishment.get("evidence") or {}, default=str),
                    },
                )

            license_params = {
                **license_record,
                "establishment_id": establishment_id,
                "resolution_evidence": json.dumps(license_record.get("resolution_evidence") or {}, default=str),
                "raw_payload": json.dumps(license_record.get("raw_payload") or {}, default=str),
            }
            license_row = self.connection.execute(
                """INSERT INTO business_licenses (
                     license_fingerprint,source_system,source_license_id,company_id,establishment_id,legal_name,
                     trade_name,entity_type,license_type,business_activity,category,license_status,status_date,
                     initial_issue_date,start_date,end_date,premise_address,city,county,county_fips,state_code,
                     postal_code,country_code,latitude,longitude,location_precision,premise_is_public_business_location,
                     source_url,observed_at,first_observed_at,last_observed_at,resolution_status,resolution_evidence,raw_payload
                   ) VALUES (
                     %(license_fingerprint)s,%(source_system)s,%(source_license_id)s,NULL,%(establishment_id)s,
                     %(legal_name)s,%(trade_name)s,%(entity_type)s,%(license_type)s,%(business_activity)s,%(category)s,
                     %(license_status)s,%(status_date)s,%(initial_issue_date)s,%(start_date)s,%(end_date)s,
                     %(premise_address)s,%(city)s,%(county)s,%(county_fips)s,%(state_code)s,%(postal_code)s,
                     %(country_code)s,%(latitude)s,%(longitude)s,%(location_precision)s,
                     %(premise_is_public_business_location)s,%(source_url)s,%(observed_at)s,%(first_observed_at)s,
                     %(last_observed_at)s,%(resolution_status)s,%(resolution_evidence)s::jsonb,%(raw_payload)s::jsonb
                   ) ON CONFLICT (source_system,source_license_id) DO UPDATE SET
                     establishment_id=COALESCE(business_licenses.establishment_id,EXCLUDED.establishment_id),
                     legal_name=EXCLUDED.legal_name,trade_name=EXCLUDED.trade_name,entity_type=EXCLUDED.entity_type,
                     license_type=EXCLUDED.license_type,business_activity=EXCLUDED.business_activity,
                     category=EXCLUDED.category,license_status=EXCLUDED.license_status,status_date=EXCLUDED.status_date,
                     initial_issue_date=EXCLUDED.initial_issue_date,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,
                     premise_address=EXCLUDED.premise_address,city=EXCLUDED.city,county=EXCLUDED.county,
                     county_fips=EXCLUDED.county_fips,state_code=EXCLUDED.state_code,postal_code=EXCLUDED.postal_code,
                     latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,location_precision=EXCLUDED.location_precision,
                     premise_is_public_business_location=EXCLUDED.premise_is_public_business_location,
                     source_url=EXCLUDED.source_url,observed_at=EXCLUDED.observed_at,
                     last_observed_at=greatest(business_licenses.last_observed_at,EXCLUDED.last_observed_at),
                     raw_payload=EXCLUDED.raw_payload,updated_at=now()
                   RETURNING id::text,(xmax=0) AS inserted""",
                license_params,
            ).fetchone()
            self.connection.execute(
                """INSERT INTO business_license_versions (
                     business_license_id,source_record_fingerprint,content_hash,source_url,collected_at,raw_payload
                   ) VALUES (%s,%s,%s,%s,%s,%s::jsonb)
                   ON CONFLICT (source_record_fingerprint) DO NOTHING""",
                (
                    license_row["id"], license_record["source_record_fingerprint"], license_record["content_hash"],
                    license_record["source_url"], license_record["last_observed_at"],
                    json.dumps(license_record.get("raw_payload") or {}, default=str),
                ),
            )

            signal = license_record.get("signal")
            if signal and establishment_id:
                self.connection.execute(
                    """INSERT INTO business_change_signals (
                         signal_fingerprint,company_id,establishment_id,signal_family,signal_type,direction,
                         observed_at,effective_date,country_code,state_code,county_fips,city,postal_code,
                         latitude,longitude,location_precision,strength,reliability,confidence,source_system,
                         source_url,source_event_type,source_event_id,evidence
                       ) VALUES (
                         %(signal_fingerprint)s,NULL,%(establishment_id)s,%(signal_family)s,%(signal_type)s,
                         %(direction)s,%(observed_at)s,%(effective_date)s,%(country_code)s,%(state_code)s,
                         %(county_fips)s,%(city)s,%(postal_code)s,%(latitude)s,%(longitude)s,%(location_precision)s,
                         %(strength)s,%(reliability)s,%(confidence)s,%(source_system)s,%(source_url)s,
                         %(source_event_type)s,%(source_event_id)s,%(evidence)s::jsonb
                       ) ON CONFLICT (signal_fingerprint) DO NOTHING""",
                    {
                        **signal,
                        "establishment_id": establishment_id,
                        "evidence": json.dumps(signal.get("evidence") or {}, default=str),
                    },
                )
            self.connection.commit()
            return {
                "id": license_row["id"],
                "inserted": bool(license_row["inserted"]),
                "establishment_id": establishment_id,
                "signal_written": bool(signal and establishment_id),
            }
        except Exception:
            self.connection.rollback()
            raise

    def persist_business_change_assessment(self, assessment: dict[str, Any]) -> bool:
        row = self.connection.execute(
            """INSERT INTO business_change_assessments (
                 assessment_fingerprint,unit_type,company_id,establishment_id,country_code,state_code,county_fips,
                 city,postal_code,assessment_type,as_of_date,score,band,evidence_quality,data_sufficiency,
                 model_version,components,explanation
               ) VALUES (
                 %(assessment_fingerprint)s,%(unit_type)s,%(company_id)s,%(establishment_id)s,%(country_code)s,
                 %(state_code)s,%(county_fips)s,%(city)s,%(postal_code)s,%(assessment_type)s,%(as_of_date)s,
                 %(score)s,%(band)s,%(evidence_quality)s,%(data_sufficiency)s,%(model_version)s,
                 %(components)s::jsonb,%(explanation)s
               ) ON CONFLICT (assessment_fingerprint) DO NOTHING RETURNING id""",
            {**assessment, "components": json.dumps(assessment.get("components") or {}, default=str)},
        ).fetchone()
        self.connection.commit()
        return bool(row)

    def company_candidates(self, observed_name: str | None, *, limit: int = 20) -> list[dict[str, Any]]:
        if not observed_name:
            return []
        rows = self.connection.execute(
            """SELECT id::text,canonical_name,legal_name,uei,cage_code,
               parent_company_id::text,organization_id::text,legal_entity_country,
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
        normalized_system = system.upper()
        if normalized_system in {"UEI", "CAGE", "CAGE_CODE"}:
            column = "uei" if normalized_system == "UEI" else "cage_code"
            rows = self.connection.execute(
                f"""SELECT id::text,canonical_name,legal_name,uei,cage_code
                    FROM companies WHERE upper({column})=upper(%s) AND NOT is_benchmark LIMIT 2""",
                (value,),
            ).fetchall()
            if len(rows) == 1:
                return dict(rows[0])
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
               associated_event_ids,evidence,source.original_url AS source_url,source.publisher,
               event_locations.origin,event_locations.destination
               FROM movement_indicators mi LEFT JOIN LATERAL (
                 SELECT original_url,publisher FROM company_event_sources
                 WHERE event_id=mi.event_id ORDER BY is_primary DESC,collected_at DESC LIMIT 1
               ) source ON true
               LEFT JOIN LATERAL (
                 SELECT
                   (jsonb_agg(jsonb_build_object('country_code',country_code,'state_code',state_code,'county_fips',county_fips,'city',city))
                     FILTER (WHERE location_role='origin'))->0 AS origin,
                   (jsonb_agg(jsonb_build_object('country_code',country_code,'state_code',state_code,'county_fips',county_fips,'city',city))
                     FILTER (WHERE location_role IN ('destination','headquarters')))->0 AS destination
                 FROM company_event_locations WHERE event_id=mi.event_id
               ) event_locations ON true
               WHERE mi.company_id=%s AND mi.observed_at < (%s::date + interval '1 day')
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

    def change_company_ids(self) -> list[str]:
        rows = self.connection.execute(
            """SELECT company_id::text FROM movement_indicators
               UNION SELECT company_id::text FROM procurement_events WHERE company_id IS NOT NULL
               ORDER BY 1"""
        ).fetchall()
        return [row["company_id"] for row in rows]

    def change_signals_for_company(self, company_id: str, as_of_date: date) -> list[dict[str, Any]]:
        signals = self.movement_indicators_for_company(company_id, as_of_date)
        for signal in signals:
            signal["source_family"] = signal.get("source_system")
        rows = self.connection.execute(
            """WITH transaction_values AS (
                 SELECT t.*,
                        lag(t.current_total_value) OVER (
                          PARTITION BY t.award_id ORDER BY t.action_date NULLS LAST,t.created_at,t.id
                        ) AS prior_current_total_value
                 FROM transactions t WHERE NOT t.is_benchmark
               )
               SELECT e.id::text,e.event_type AS indicator_type,e.event_at AS observed_at,e.source_system,e.source_url,
               CASE WHEN e.event_type='value_decreased' THEN 'negative' ELSE 'positive' END AS direction,
               e.source_country AS country_code,0.55::text AS strength,0.95::text AS reliability,
               0.90::text AS confidence,e.currency,
               COALESCE(e.value_delta_native,tx.obligation) AS adjustment_delta,
               COALESCE(
                 NULLIF(abs(tx.prior_current_total_value),0),
                 NULLIF(abs(tx.current_total_value),0),
                 NULLIF(abs(a.current_value),0),
                 NULLIF(abs(a.potential_value),0),
                 NULLIF(abs(a.total_obligated),0)
               ) AS reference_award_value
               FROM procurement_events e
               LEFT JOIN transaction_values tx ON tx.source_transaction_id=e.raw_source_id AND tx.award_id=e.award_id
               LEFT JOIN awards a ON a.id=e.award_id
               WHERE e.company_id=%s AND e.event_at < (%s::date + interval '1 day')
                 AND e.event_type IN ('award_announced','value_increased','value_decreased')
               ORDER BY e.event_at""",
            (company_id, as_of_date),
        ).fetchall()
        for row in rows:
            item = dict(row)
            if item["indicator_type"] in {"value_increased", "value_decreased"}:
                materiality = evaluate_award_adjustment(
                    item.get("adjustment_delta"), item.get("reference_award_value"), item.get("currency")
                )
                if materiality.status != "material":
                    continue
                item["materiality_status"] = materiality.status
                item["materiality_percent"] = materiality.percent
            item.update({
                "evidence_key": f"procurement:{item['id']}",
                "source_family": "federal_procurement",
                "associated_event_ids": [],
            })
            signals.append(item)
        return signals

    def latest_change_score(self, company_id: str, assessment_type: str) -> float | None:
        row = self.connection.execute(
            """SELECT score FROM movement_assessments
               WHERE company_id=%s AND assessment_type=%s AND model_version='company-change-indication-v2'
               ORDER BY as_of_date DESC,generated_at DESC LIMIT 1""",
            (company_id, assessment_type),
        ).fetchone()
        return float(row["score"]) if row and row["score"] is not None else None

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

    def persist_indication_alert(self, assessment: dict[str, Any], previous_score: float | None) -> int:
        current_score = assessment.get("score")
        if not material_indication_change(previous_score, current_score):
            return 0
        source_item = next(
            (item for item in assessment["components"].get("items", []) if item.get("source_url")), None
        )
        if not source_item:
            return 0
        targets = self.connection.execute(
            """SELECT id::text FROM company_monitor_targets
               WHERE company_id=%s AND tracking_status='active'""",
            (assessment["company_id"],),
        ).fetchall()
        inserted = 0
        for target in targets:
            row = self.connection.execute(
                """INSERT INTO alert_events (
                     dedupe_key,company_id,monitor_target_id,alert_type,title,summary,event_date,market,
                     source_type,source_id,source_system,source_url,match_status
                   ) VALUES (%s,%s,%s,'indication_strengthened',%s,%s,%s,%s,'movement_assessment',%s,%s,%s,'approved')
                   ON CONFLICT (dedupe_key) DO NOTHING RETURNING id""",
                (
                    f"change:{assessment['assessment_fingerprint']}:{target['id']}", assessment["company_id"], target["id"],
                    f"{assessment['assessment_type'].replace('_', ' ').title()} indication strengthened",
                    f"Descriptive score moved from {previous_score:.1f} to {float(current_score):.1f}; this is not a probability.",
                    assessment["as_of_date"], assessment.get("country_code"), assessment["assessment_fingerprint"],
                    source_item["source_system"], source_item["source_url"],
                ),
            ).fetchone()
            inserted += int(bool(row))
        self.connection.commit()
        return inserted

    def outcome_candidates(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """SELECT e.id::text AS event_id,ec.company_id::text,e.event_type,e.verification_status,
               ec.review_status,e.announced_date,e.event_date,e.effective_start_date,e.title,
               e.jobs_created,e.jobs_affected,e.capital_investment,e.currency,e.source_country,
               e.primary_state,e.primary_county_fips,e.primary_city,e.first_observed_at,e.source_system,
               source.original_url AS source_url,
               COALESCE(loc.locations,'[]'::jsonb) AS locations
               FROM company_events e
               JOIN company_event_companies ec ON ec.event_id=e.id AND ec.relationship_type='subject'
               JOIN LATERAL (
                 SELECT ces.original_url FROM company_event_sources ces
                 WHERE ces.event_id=e.id ORDER BY ces.is_primary DESC,ces.collected_at LIMIT 1
               ) source ON true
               LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object(
                   'location_role',l.location_role,'country_code',l.country_code,'state_code',l.state_code,
                   'county_fips',l.county_fips,'city',l.city
                 )) AS locations FROM company_event_locations l WHERE l.event_id=e.id
               ) loc ON true
               WHERE e.verification_status IN ('source_verified','corroborated')
                 AND ec.review_status IN ('auto_verified','approved')
               ORDER BY e.first_observed_at"""
        ).fetchall()
        return [dict(row) for row in rows]

    def registration_candidates(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """SELECT id::text,source_system,official_identifier,legal_name,formation_date,registration_date,
               country_code,state_code,county_fips,city,source_url,company_id::text,resolution_status,
               first_observed_at FROM business_registrations
               WHERE resolution_status<>'rejected' ORDER BY first_observed_at"""
        ).fetchall()
        return [dict(row) for row in rows]

    def persist_outcome(self, outcome: dict[str, Any]) -> bool:
        columns = (
            "outcome_fingerprint", "company_id", "definition_version", "outcome_type", "outcome_date",
            "announcement_date", "country_code", "state_code", "county_fips", "city", "origin_country",
            "origin_state", "origin_county_fips", "origin_city", "destination_country", "destination_state",
            "destination_county_fips", "destination_city", "jobs_created", "jobs_lost", "capital_investment",
            "currency", "square_feet", "source_system", "source_url", "source_event_id", "registration_id",
            "verification_status", "evidence", "first_observed_at",
        )
        values = [json.dumps(outcome[name], default=str) if name == "evidence" else outcome.get(name) for name in columns]
        placeholders = ["%s::jsonb" if name == "evidence" else "%s" for name in columns]
        row = self.connection.execute(
            f"INSERT INTO company_outcomes ({','.join(columns)}) VALUES ({','.join(placeholders)}) "
            "ON CONFLICT (outcome_fingerprint) DO NOTHING RETURNING id::text",
            values,
        ).fetchone()
        if row and outcome.get("company_id") and outcome["outcome_type"] in {"expansion", "relocation", "closure"}:
            alert_type = {
                "expansion": "confirmed_expansion", "relocation": "confirmed_relocation", "closure": "confirmed_closure",
            }[outcome["outcome_type"]]
            targets = self.connection.execute(
                "SELECT id::text FROM company_monitor_targets WHERE company_id=%s AND tracking_status='active'",
                (outcome["company_id"],),
            ).fetchall()
            for target in targets:
                self.connection.execute(
                    """INSERT INTO alert_events (
                         dedupe_key,company_id,monitor_target_id,alert_type,title,summary,event_date,market,
                         source_type,source_id,source_system,source_url,match_status
                       ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'company_outcome',%s,%s,%s,'approved')
                       ON CONFLICT (dedupe_key) DO NOTHING""",
                    (
                        f"outcome:{outcome['outcome_fingerprint']}:{target['id']}", outcome["company_id"], target["id"],
                        alert_type, f"Confirmed {outcome['outcome_type'].replace('_', ' ')}",
                        "A source-backed outcome passed the versioned outcome definition.", outcome["outcome_date"],
                        outcome.get("country_code"), outcome["outcome_fingerprint"], outcome["source_system"], outcome["source_url"],
                    ),
                )
        self.connection.commit()
        return bool(row)

    def all_outcomes(self) -> list[dict[str, Any]]:
        return [dict(row) for row in self.connection.execute("SELECT * FROM company_outcomes ORDER BY outcome_date").fetchall()]

    def persist_formation_snapshot(self, snapshot: dict[str, Any]) -> bool:
        columns = (
            "snapshot_fingerprint", "as_of_month", "country_code", "state_code", "county_fips", "industry_code",
            "industry_label", "new_registrations", "active_registrations", "closures_dissolutions",
            "commercial_permits", "new_construction_permits", "tenant_improvement_permits", "job_posting_volume",
            "sbir_sttr_awards", "nih_grants", "federal_awards", "state_incentives", "employment", "average_wage",
            "establishment_count", "formation_score", "activity_level", "data_sufficiency", "model_version",
            "components", "coverage",
        )
        values = [json.dumps(snapshot[name], default=str) if name in {"components", "coverage"} else snapshot.get(name) for name in columns]
        placeholders = ["%s::jsonb" if name in {"components", "coverage"} else "%s" for name in columns]
        row = self.connection.execute(
            f"INSERT INTO formation_activity_snapshots ({','.join(columns)}) VALUES ({','.join(placeholders)}) "
            "ON CONFLICT (snapshot_fingerprint) DO NOTHING RETURNING id",
            values,
        ).fetchone()
        self.connection.commit()
        return bool(row)

    def formation_cells(self, as_of_month: date) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            """WITH monthly AS (
                 SELECT date_trunc('month',COALESCE(formation_date,registration_date))::date AS month,
                        country_code,state_code,county_fips,COALESCE(industry_code,'UNCLASSIFIED') AS industry_code,
                        max(industry_label) AS industry_label,count(*)::int AS registrations
                 FROM business_registrations
                 WHERE COALESCE(formation_date,registration_date) <= (%s::date + interval '1 month - 1 day')
                   AND observed_at < (%s::date + interval '1 month') AND resolution_status<>'rejected'
                 GROUP BY 1,2,3,4,5
               )
               SELECT current.country_code,current.state_code,current.county_fips,current.industry_code,current.industry_label,
                      current.registrations AS new_registrations,previous.registrations AS previous_year_registrations,
                      rolling.average_registrations AS rolling_average_registrations
               FROM monthly current
               LEFT JOIN monthly previous ON previous.country_code=current.country_code
                 AND previous.state_code IS NOT DISTINCT FROM current.state_code
                 AND previous.county_fips IS NOT DISTINCT FROM current.county_fips
                 AND previous.industry_code=current.industry_code AND previous.month=current.month-interval '1 year'
               LEFT JOIN LATERAL (
                 SELECT avg(m.registrations)::numeric AS average_registrations FROM monthly m
                 WHERE m.country_code=current.country_code AND m.state_code IS NOT DISTINCT FROM current.state_code
                   AND m.county_fips IS NOT DISTINCT FROM current.county_fips AND m.industry_code=current.industry_code
                   AND m.month<current.month AND m.month>=current.month-interval '12 months'
               ) rolling ON true WHERE current.month=%s ORDER BY 1,2,3,4""",
            (as_of_month, as_of_month, as_of_month),
        ).fetchall()
        return [dict(row) for row in rows]

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
                    source.get("publication_date"), source["collected_at"], source["source_type"],
                    "linked" if match.status == "matched" else match.status,
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
                        json.dumps({
                            "rule": match.method,
                            "requires_review": not identifier_verified,
                            "candidate_legal_name": match.company.get("legal_name"),
                            "candidate_uei": match.company.get("uei"),
                            "candidate_cage_code": match.company.get("cage_code"),
                            "source_url": source.get("original_url"),
                        }), review_status,
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
            "candidate_legal_name": candidate.get("legal_name") if candidate else None,
            "candidate_uei": candidate.get("uei") if candidate else None,
            "candidate_cage_code": candidate.get("cage_code") if candidate else None,
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
