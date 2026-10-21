from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import Any


def _slugify(value: str) -> str:
    return (re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-") or "entity")[:70]


class GlobalProcurementRepositoryMixin:
    """Persistence shared by all non-USAspending source adapters."""

    def start_source_sync(self, source_system: str, checkpoint_key: str) -> None:
        self._ensure_connection()
        self.connection.execute(
            """INSERT INTO source_checkpoints (source_system,checkpoint_key,status)
               VALUES (%s,%s,'running') ON CONFLICT (source_system,checkpoint_key) DO UPDATE SET
               status='running',error_summary=NULL,updated_at=now()""",
            (source_system, checkpoint_key),
        )
        self.connection.execute(
            "UPDATE data_sources SET last_attempt_at=now() WHERE source_system=%s", (source_system,)
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
        self._ensure_connection()
        self.connection.execute(
            """UPDATE source_checkpoints SET checkpoint_value=%s,status=%s,records_seen=%s,records_written=%s,
               error_summary=%s,metadata=%s::jsonb,updated_at=now()
               WHERE source_system=%s AND checkpoint_key=%s""",
            (
                checkpoint_value, status, stats.get("received", 0), stats.get("written", 0), error_summary,
                json.dumps(stats), source_system, checkpoint_key,
            ),
        )
        self.connection.execute(
            """UPDATE data_sources SET quality_status=%s,last_record_count=%s,
               last_success_at=CASE WHEN %s='success' THEN now() ELSE last_success_at END
               WHERE source_system=%s""",
            ("healthy" if status == "success" else "partial" if status == "partial" else "degraded", stats.get("received", 0), status, source_system),
        )
        self.connection.commit()

    def _upsert_global_buyer(self, record: dict[str, Any]) -> str:
        buyer = record["buyer"]
        row = self.connection.execute(
            """INSERT INTO buyers (
                 source_country,source_system,source_buyer_id,name,identifier_scheme,identifier_value,address,source_url
               ) VALUES (%s,%s,%s,%s,%s,%s,%s::jsonb,%s)
               ON CONFLICT (source_system,source_buyer_id) DO UPDATE SET
                 name=EXCLUDED.name,identifier_scheme=COALESCE(EXCLUDED.identifier_scheme,buyers.identifier_scheme),
                 identifier_value=COALESCE(EXCLUDED.identifier_value,buyers.identifier_value),
                 address=CASE WHEN EXCLUDED.address='{}'::jsonb THEN buyers.address ELSE EXCLUDED.address END,
                 source_url=EXCLUDED.source_url RETURNING id::text""",
            (
                record["source_country"], record["source_system"], buyer["source_buyer_id"], buyer["name"],
                buyer.get("identifier_scheme"), buyer.get("identifier_value"), json.dumps(buyer.get("address") or {}),
                record["source_url"],
            ),
        ).fetchone()
        return row["id"]

    def _find_company_by_identifiers(self, identifiers: list[dict[str, str]], country: str) -> str | None:
        for identifier in identifiers:
            row = self.connection.execute(
                """SELECT company_id::text FROM entity_identifiers
                   WHERE company_id IS NOT NULL AND upper(identifier_system)=upper(%s)
                     AND upper(identifier_value)=upper(%s) AND (country_code=%s OR country_code IS NULL)
                   ORDER BY is_verified DESC,observed_at LIMIT 1""",
                (identifier["scheme"], identifier["id"], country),
            ).fetchone()
            if row:
                return row["company_id"]
        return None

    def _upsert_global_supplier(self, record: dict[str, Any], supplier: dict[str, Any]) -> str:
        identifiers = list(supplier.get("identifiers") or [])
        scoped_identifier = {
            "scheme": "OCDS_PARTY",
            "id": f"{record['source_system']}:{record['source_process_id']}:{supplier.get('source_supplier_id') or supplier['legal_name']}",
        }
        identity_candidates = identifiers or [scoped_identifier]
        company_id = self._find_company_by_identifiers(identity_candidates, record["source_country"])
        if not company_id:
            identity = identity_candidates[0]
            suffix = hashlib.sha256(
                f"{record['source_country']}|{identity['scheme']}|{identity['id']}".encode("utf-8")
            ).hexdigest()[:10]
            address = supplier.get("address") or {}
            row = self.connection.execute(
                """INSERT INTO companies (
                     legal_name,canonical_name,slug,recipient_address,recipient_city,recipient_state,recipient_zip,
                     recipient_country,legal_entity_country,first_seen,last_seen
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,current_date,current_date)
                   ON CONFLICT (slug) DO UPDATE SET legal_name=EXCLUDED.legal_name,
                     canonical_name=EXCLUDED.canonical_name,last_seen=current_date
                   RETURNING id::text""",
                (
                    supplier["legal_name"], supplier["legal_name"], f"{_slugify(supplier['legal_name'])}-{suffix}",
                    address.get("streetAddress"), address.get("locality"), address.get("region"),
                    address.get("postalCode"), address.get("country") or record["source_country"],
                    record["source_country"],
                ),
            ).fetchone()
            company_id = row["id"]
        for identifier in identity_candidates:
            self.connection.execute(
                """INSERT INTO entity_identifiers (
                     company_id,identifier_system,identifier_value,country_code,source_system,source_url,is_verified
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (company_id,upper(identifier_system),upper(identifier_value)) WHERE company_id IS NOT NULL
                   DO UPDATE SET observed_at=now(),source_url=EXCLUDED.source_url,
                     is_verified=entity_identifiers.is_verified OR EXCLUDED.is_verified""",
                (
                    company_id, identifier["scheme"], identifier["id"], record["source_country"],
                    record["source_system"], record["source_url"], identifier["scheme"].upper() in {"GB-COH", "COMPANIES_HOUSE"},
                ),
            )
        return company_id

    def _common_industry_id(self, native_code: str | None) -> str | None:
        if not native_code:
            return None
        row = self.connection.execute(
            """SELECT industry_id::text FROM cpv_industry_map
               WHERE %s LIKE cpv_prefix || '%%' ORDER BY length(cpv_prefix) DESC LIMIT 1""",
            (native_code,),
        ).fetchone()
        return row["industry_id"] if row else None

    def ingest_global_release(self, record: dict[str, Any]) -> bool:
        with self.transaction():
            buyer_id = self._upsert_global_buyer(record)
            supplier_ids = [self._upsert_global_supplier(record, supplier) for supplier in record.get("suppliers") or []]
            industry_id = self._common_industry_id(record.get("native_category_code"))
            process = self.connection.execute(
                """INSERT INTO procurement_processes (
                     source_country,source_system,source_process_id,ocid,buyer_id,primary_supplier_company_id,
                     title,description,current_stage,status,procurement_method,published_at,tender_start_at,tender_end_at,
                     award_date,contract_start_date,contract_end_date,value_native,currency,value_usd,fx_rate,
                     fx_rate_date,fx_source_url,performance_locations,native_category_scheme,native_category_code,
                     common_industry_id,source_url,source_last_modified
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s)
                   ON CONFLICT (source_system,source_process_id) DO UPDATE SET
                     buyer_id=EXCLUDED.buyer_id,
                     primary_supplier_company_id=COALESCE(EXCLUDED.primary_supplier_company_id,procurement_processes.primary_supplier_company_id),
                     title=COALESCE(EXCLUDED.title,procurement_processes.title),
                     description=COALESCE(EXCLUDED.description,procurement_processes.description),
                     current_stage=COALESCE(EXCLUDED.current_stage,procurement_processes.current_stage),
                     status=COALESCE(EXCLUDED.status,procurement_processes.status),
                     procurement_method=COALESCE(EXCLUDED.procurement_method,procurement_processes.procurement_method),
                     published_at=LEAST(EXCLUDED.published_at,procurement_processes.published_at),
                     tender_start_at=COALESCE(EXCLUDED.tender_start_at,procurement_processes.tender_start_at),
                     tender_end_at=COALESCE(EXCLUDED.tender_end_at,procurement_processes.tender_end_at),
                     award_date=COALESCE(EXCLUDED.award_date,procurement_processes.award_date),
                     contract_start_date=COALESCE(EXCLUDED.contract_start_date,procurement_processes.contract_start_date),
                     contract_end_date=COALESCE(EXCLUDED.contract_end_date,procurement_processes.contract_end_date),
                     value_native=COALESCE(EXCLUDED.value_native,procurement_processes.value_native),
                     currency=COALESCE(EXCLUDED.currency,procurement_processes.currency),
                     performance_locations=CASE WHEN EXCLUDED.performance_locations='[]'::jsonb THEN procurement_processes.performance_locations ELSE EXCLUDED.performance_locations END,
                     native_category_scheme=COALESCE(EXCLUDED.native_category_scheme,procurement_processes.native_category_scheme),
                     native_category_code=COALESCE(EXCLUDED.native_category_code,procurement_processes.native_category_code),
                     common_industry_id=COALESCE(EXCLUDED.common_industry_id,procurement_processes.common_industry_id),
                     source_url=EXCLUDED.source_url,
                     source_last_modified=GREATEST(EXCLUDED.source_last_modified,procurement_processes.source_last_modified)
                   RETURNING id::text""",
                (
                    record["source_country"], record["source_system"], record["source_process_id"], record.get("ocid"),
                    buyer_id, supplier_ids[0] if supplier_ids else None, record.get("title"), record.get("description"),
                    record.get("current_stage"), record.get("status"), record.get("procurement_method"),
                    record.get("published_at"), record.get("tender_start_at"), record.get("tender_end_at"),
                    record.get("award_date"), record.get("contract_start_date"), record.get("contract_end_date"),
                    record.get("value_native"), record.get("currency"), record.get("value_usd"), record.get("fx_rate"),
                    record.get("fx_rate_date"), record.get("fx_source_url"),
                    json.dumps(record.get("performance_locations") or []), record.get("native_category_scheme"),
                    record.get("native_category_code"), industry_id, record["source_url"], record.get("source_last_modified"),
                ),
            ).fetchone()
            process_id = process["id"]
            release_date = record.get("release_date")
            self.connection.execute(
                """UPDATE data_sources SET
                   coverage_start=CASE WHEN %s::timestamptz IS NULL THEN coverage_start ELSE LEAST(COALESCE(coverage_start,%s::timestamptz::date),%s::timestamptz::date) END,
                   coverage_end=CASE WHEN %s::timestamptz IS NULL THEN coverage_end ELSE GREATEST(COALESCE(coverage_end,%s::timestamptz::date),%s::timestamptz::date) END
                   WHERE source_system=%s""",
                (release_date, release_date, release_date, release_date, release_date, release_date, record["source_system"]),
            )
            release = self.connection.execute(
                """INSERT INTO procurement_process_releases (
                     process_id,source_system,source_release_id,release_date,tags,payload_hash,source_url,payload
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
                   ON CONFLICT (source_system,source_release_id,payload_hash) DO NOTHING RETURNING id""",
                (
                    process_id, record["source_system"], record["source_release_id"], record.get("release_date"),
                    record.get("tags") or [], record["payload_hash"], record["source_url"],
                    json.dumps(record["raw"], default=str),
                ),
            ).fetchone()
            for index, company_id in enumerate(supplier_ids):
                source_supplier_id = (record.get("suppliers") or [])[index].get("source_supplier_id")
                self.connection.execute(
                    """INSERT INTO procurement_process_suppliers (process_id,company_id,source_supplier_id,is_primary)
                       VALUES (%s,%s,%s,%s) ON CONFLICT (process_id,company_id) DO UPDATE SET
                       source_supplier_id=COALESCE(EXCLUDED.source_supplier_id,procurement_process_suppliers.source_supplier_id),
                       is_primary=procurement_process_suppliers.is_primary OR EXCLUDED.is_primary""",
                    (process_id, company_id, source_supplier_id, index == 0),
                )
            for event in record.get("events") or []:
                self.connection.execute(
                    """INSERT INTO procurement_events (
                         event_fingerprint,source_system,source_country,raw_source_id,process_id,company_id,buyer_id,
                         event_type,event_at,title,description,value_delta_native,value_native,currency,source_url,evidence
                       ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
                       ON CONFLICT (event_fingerprint) DO NOTHING""",
                    (
                        event["event_fingerprint"], record["source_system"], record["source_country"],
                        event.get("raw_source_id"), process_id, supplier_ids[0] if supplier_ids else None, buyer_id,
                        event["event_type"], event["event_at"], event.get("title"), event.get("description"),
                        event.get("value_delta_native"), event.get("value_native") or record.get("value_native"),
                        event.get("currency") or record.get("currency"), event["source_url"],
                        json.dumps(event.get("evidence") or {}),
                    ),
                )
            return bool(release)

    def upsert_us_procurement_process_and_events(
        self,
        normalized: dict[str, Any],
        *,
        company_id: str,
        award_id: str,
        award_inserted: bool,
        events: list[dict[str, Any]],
    ) -> None:
        award = normalized["award"]
        agency_name = award.get("awarding_agency") or award.get("awarding_department")
        buyer_id = None
        if agency_name:
            buyer_id = self.connection.execute(
                """INSERT INTO buyers (source_country,source_system,source_buyer_id,name,source_url)
                   VALUES ('US','usaspending',%s,%s,%s)
                   ON CONFLICT (source_system,source_buyer_id) DO UPDATE SET name=EXCLUDED.name
                   RETURNING id::text""",
                (agency_name, agency_name, award.get("source_url") or "https://www.usaspending.gov/"),
            ).fetchone()["id"]
        process = self.connection.execute(
            """INSERT INTO procurement_processes (
                 source_country,source_system,source_process_id,buyer_id,primary_supplier_company_id,title,description,
                 current_stage,status,award_date,contract_start_date,contract_end_date,value_native,currency,
                 performance_locations,native_category_scheme,native_category_code,common_industry_id,source_url,source_last_modified
               ) SELECT 'US','usaspending',%s,%s,%s,%s,%s,'award','active',%s,%s,%s,%s,'USD',%s::jsonb,
                 CASE WHEN %s::text IS NOT NULL THEN 'NAICS' WHEN %s::text IS NOT NULL THEN 'PSC' END,
                 COALESCE(%s,%s),%s,%s,%s
               FROM awards a WHERE a.id=%s
               ON CONFLICT (source_system,source_process_id) DO UPDATE SET
                 buyer_id=COALESCE(EXCLUDED.buyer_id,procurement_processes.buyer_id),
                 title=COALESCE(EXCLUDED.title,procurement_processes.title),
                 description=COALESCE(EXCLUDED.description,procurement_processes.description),
                 award_date=COALESCE(EXCLUDED.award_date,procurement_processes.award_date),
                 contract_start_date=COALESCE(EXCLUDED.contract_start_date,procurement_processes.contract_start_date),
                 contract_end_date=COALESCE(EXCLUDED.contract_end_date,procurement_processes.contract_end_date),
                 value_native=COALESCE(EXCLUDED.value_native,procurement_processes.value_native),
                 source_last_modified=GREATEST(EXCLUDED.source_last_modified,procurement_processes.source_last_modified)
               RETURNING id::text""",
            (
                award["generated_award_id"], buyer_id, company_id, award.get("title"), award.get("description"),
                award.get("award_date"), award.get("start_date"), award.get("end_date"),
                award.get("current_value") or award.get("total_obligated"),
                json.dumps([award.get("performance") or {}]), award.get("naics"), award.get("psc"),
                award.get("naics"), award.get("psc"), award.get("primary_industry_id"),
                award.get("source_url") or "https://www.usaspending.gov/", award.get("last_modified"), award_id,
            ),
        ).fetchone()
        process_id = process["id"]
        self.connection.execute("UPDATE awards SET procurement_process_id=%s WHERE id=%s", (process_id, award_id))
        self.connection.execute(
            """INSERT INTO procurement_process_suppliers (process_id,company_id,is_primary)
               VALUES (%s,%s,true) ON CONFLICT (process_id,company_id) DO UPDATE SET is_primary=true""",
            (process_id, company_id),
        )
        for event in events:
            self.connection.execute(
                """INSERT INTO procurement_events (
                     event_fingerprint,source_system,source_country,raw_source_id,process_id,award_id,company_id,buyer_id,
                     event_type,event_at,title,description,value_delta_native,value_native,currency,source_url,evidence
                   ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)
                   ON CONFLICT (event_fingerprint) DO NOTHING""",
                (
                    event["event_fingerprint"], event["source_system"], event["source_country"], event.get("raw_source_id"),
                    process_id, award_id, company_id, buyer_id, event["event_type"], event["event_at"], event.get("title"),
                    event.get("description"), event.get("value_delta_native"), event.get("value_native"),
                    event.get("currency"), event["source_url"], json.dumps(event.get("evidence") or {}),
                ),
            )
