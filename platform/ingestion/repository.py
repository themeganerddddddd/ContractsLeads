from __future__ import annotations

import hashlib
import json
import re
from contextlib import contextmanager
from datetime import date
from datetime import datetime

import psycopg
from psycopg.rows import dict_row

from .events import derive_usaspending_events
from .global_repository import GlobalProcurementRepositoryMixin


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-") or "company"
    return slug[:70]


class PostgresRepository(GlobalProcurementRepositoryMixin):
    def __init__(self, database_url: str):
        self._database_url = database_url
        self.connection = self._connect()

    def _connect(self):
        return psycopg.connect(self._database_url, row_factory=dict_row)

    def _ensure_connection(self):
        """Reconnect between transactions after a transient database disconnect."""
        if self.connection.closed or self.connection.broken:
            self.connection = self._connect()
        return self.connection

    def close(self) -> None:
        self.connection.close()

    def last_successful_checkpoint(self, source: str) -> datetime | None:
        self._ensure_connection()
        row = self.connection.execute(
            "SELECT end_checkpoint FROM ingestion_runs WHERE source=%s AND status='success' AND end_checkpoint IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
            (source,),
        ).fetchone()
        return row["end_checkpoint"] if row else None

    def start_run(self, source: str, start_checkpoint: datetime, end_checkpoint: datetime) -> str:
        self._ensure_connection()
        row = self.connection.execute(
            "INSERT INTO ingestion_runs (status,source,start_checkpoint,end_checkpoint) VALUES ('running',%s,%s,%s) RETURNING id::text",
            (source, start_checkpoint, end_checkpoint),
        ).fetchone()
        self.connection.commit()
        return row["id"]

    def finish_run(self, run_id: str, status: str, stats: dict, error_summary: str | None = None) -> None:
        self._ensure_connection()
        self.connection.execute(
            """UPDATE ingestion_runs SET completed_at=now(),status=%s,records_requested=%s,records_received=%s,
               records_inserted=%s,records_updated=%s,records_failed=%s,records_skipped=%s,
               companies_created=%s,awards_created=%s,transactions_created=%s,batches_committed=%s,
               duration_ms=%s,error_summary=%s,metadata=%s::jsonb WHERE id=%s""",
            (
                status, stats["requested"], stats["received"], stats["inserted"], stats["updated"], stats["failed"],
                stats.get("skipped", 0), stats.get("companies_created", 0), stats.get("awards_created", 0),
                stats.get("transactions_created", 0), stats.get("batches_committed", 0), stats.get("duration_ms"),
                error_summary, json.dumps(stats.get("metadata", {})), run_id,
            ),
        )
        self.connection.commit()

    @contextmanager
    def transaction(self):
        """One explicit transaction boundary for an import batch and checkpoint."""
        connection = self._ensure_connection()
        try:
            yield
            connection.commit()
        except Exception:
            if not connection.closed and not connection.broken:
                connection.rollback()
            raise

    def _industry_id(self, slug: str):
        row = self.connection.execute("SELECT id FROM industries WHERE slug=%s", (slug,)).fetchone()
        return row["id"] if row else None

    def _upsert_agency(self, award: dict):
        name = award.get("awarding_agency")
        if not name:
            return None
        existing = self.connection.execute("SELECT id,slug FROM agencies WHERE name=%s", (name,)).fetchone()
        if existing:
            self.connection.execute(
                "UPDATE agencies SET parent_department=COALESCE(%s,parent_department) WHERE id=%s",
                (award.get("awarding_department"), existing["id"]),
            )
            return existing["id"]
        base_slug = slugify(name)
        slug_exists = self.connection.execute("SELECT 1 FROM agencies WHERE slug=%s", (base_slug,)).fetchone()
        slug = base_slug if not slug_exists else f"{base_slug}-{hashlib.sha256(name.encode('utf-8')).hexdigest()[:8]}"
        row = self.connection.execute(
            """INSERT INTO agencies (name,slug,parent_department) VALUES (%s,%s,%s)
               ON CONFLICT (name) DO UPDATE SET parent_department=COALESCE(EXCLUDED.parent_department,agencies.parent_department)
               RETURNING id""",
            (name, slug, award.get("awarding_department")),
        ).fetchone()
        return row["id"]

    def _upsert_company(self, company: dict, industry_id) -> tuple[str, bool]:
        recipient = company["recipient"]
        existing = None
        if company.get("uei"):
            existing = self.connection.execute("SELECT id,slug FROM companies WHERE upper(uei)=upper(%s)", (company["uei"],)).fetchone()
        if not existing and not company.get("uei") and recipient.get("state") and recipient.get("zip"):
            existing = self.connection.execute(
                """SELECT id,slug FROM companies WHERE uei IS NULL AND lower(legal_name)=lower(%s)
                   AND recipient_state=%s AND recipient_zip=%s LIMIT 1""",
                (company["legal_name"], recipient["state"], recipient["zip"]),
            ).fetchone()
        suffix_source = company.get("uei") or f"{company['legal_name']}|{recipient.get('state')}|{recipient.get('zip')}"
        suffix = hashlib.sha256(suffix_source.encode("utf-8")).hexdigest()[:8]
        slug = existing["slug"] if existing else f"{slugify(company['canonical_name'])}-{suffix}"
        row = self.connection.execute(
            """INSERT INTO companies (
                uei,cage_code,legal_name,canonical_name,slug,recipient_address,recipient_city,recipient_county,
                recipient_county_fips,recipient_state,recipient_state_fips,recipient_zip,recipient_country,
                primary_industry_id,business_size,first_seen,last_seen
              ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,current_date,current_date)
              ON CONFLICT (slug) DO UPDATE SET
                uei=COALESCE(EXCLUDED.uei,companies.uei),cage_code=COALESCE(EXCLUDED.cage_code,companies.cage_code),
                legal_name=EXCLUDED.legal_name,canonical_name=EXCLUDED.canonical_name,
                recipient_address=COALESCE(EXCLUDED.recipient_address,companies.recipient_address),
                recipient_city=COALESCE(EXCLUDED.recipient_city,companies.recipient_city),
                recipient_county=COALESCE(EXCLUDED.recipient_county,companies.recipient_county),
                recipient_county_fips=COALESCE(EXCLUDED.recipient_county_fips,companies.recipient_county_fips),
                recipient_state=COALESCE(EXCLUDED.recipient_state,companies.recipient_state),
                recipient_state_fips=COALESCE(EXCLUDED.recipient_state_fips,companies.recipient_state_fips),
                recipient_zip=COALESCE(EXCLUDED.recipient_zip,companies.recipient_zip),
                recipient_country=COALESCE(EXCLUDED.recipient_country,companies.recipient_country),
                primary_industry_id=COALESCE(EXCLUDED.primary_industry_id,companies.primary_industry_id),last_seen=current_date
              RETURNING id::text,(xmax=0) AS inserted""",
            (
                company.get("uei"), company.get("cage_code"), company["legal_name"], company["canonical_name"], slug,
                recipient.get("address"), recipient.get("city"), recipient.get("county"), recipient.get("county_fips"),
                recipient.get("state"), recipient.get("state_fips"), recipient.get("zip"), recipient.get("country"),
                industry_id, company.get("business_size"),
            ),
        ).fetchone()
        return row["id"], bool(row["inserted"])

    def _upsert_award(self, award: dict, company_id: str, industry_id, agency_id) -> tuple[str, bool]:
        performance = award["performance"]
        row = self.connection.execute(
            """INSERT INTO awards (
                generated_award_id,piid,parent_award_id,recipient_company_id,award_type,title,description,
                awarding_department,awarding_agency,awarding_subagency,agency_id,naics,psc,primary_industry_id,
                classification_confidence,classification_evidence,total_obligated,current_value,potential_value,
                award_date,start_date,end_date,last_modified,performance_country,performance_state,performance_state_fips,
                performance_county,performance_county_fips,performance_city,performance_zip,source_url
              ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
              ON CONFLICT (generated_award_id) WHERE generated_award_id IS NOT NULL AND btrim(generated_award_id) <> '' DO UPDATE SET
                piid=COALESCE(EXCLUDED.piid,awards.piid),parent_award_id=COALESCE(EXCLUDED.parent_award_id,awards.parent_award_id),
                recipient_company_id=EXCLUDED.recipient_company_id,award_type=COALESCE(EXCLUDED.award_type,awards.award_type),
                title=COALESCE(EXCLUDED.title,awards.title),description=COALESCE(EXCLUDED.description,awards.description),
                awarding_department=COALESCE(EXCLUDED.awarding_department,awards.awarding_department),
                awarding_agency=COALESCE(EXCLUDED.awarding_agency,awards.awarding_agency),
                awarding_subagency=COALESCE(EXCLUDED.awarding_subagency,awards.awarding_subagency),
                agency_id=COALESCE(EXCLUDED.agency_id,awards.agency_id),
                naics=COALESCE(EXCLUDED.naics,awards.naics),psc=COALESCE(EXCLUDED.psc,awards.psc),
                primary_industry_id=COALESCE(EXCLUDED.primary_industry_id,awards.primary_industry_id),
                classification_confidence=EXCLUDED.classification_confidence,classification_evidence=EXCLUDED.classification_evidence,
                total_obligated=COALESCE(EXCLUDED.total_obligated,awards.total_obligated),
                current_value=COALESCE(EXCLUDED.current_value,awards.current_value),
                potential_value=COALESCE(EXCLUDED.potential_value,awards.potential_value),
                award_date=COALESCE(EXCLUDED.award_date,awards.award_date),start_date=COALESCE(EXCLUDED.start_date,awards.start_date),
                end_date=COALESCE(EXCLUDED.end_date,awards.end_date),last_modified=GREATEST(EXCLUDED.last_modified,awards.last_modified),
                performance_country=COALESCE(EXCLUDED.performance_country,awards.performance_country),
                performance_state=COALESCE(EXCLUDED.performance_state,awards.performance_state),
                performance_state_fips=COALESCE(EXCLUDED.performance_state_fips,awards.performance_state_fips),
                performance_county=COALESCE(EXCLUDED.performance_county,awards.performance_county),
                performance_county_fips=COALESCE(EXCLUDED.performance_county_fips,awards.performance_county_fips),
                performance_city=COALESCE(EXCLUDED.performance_city,awards.performance_city),
                performance_zip=COALESCE(EXCLUDED.performance_zip,awards.performance_zip),source_url=COALESCE(EXCLUDED.source_url,awards.source_url)
              RETURNING id::text,(xmax=0) AS inserted""",
            (
                award["generated_award_id"], award.get("piid"), award.get("parent_award_id"), company_id,
                award.get("award_type"), award.get("title"), award.get("description"), award.get("awarding_department"),
                award.get("awarding_agency"), award.get("awarding_subagency"), agency_id, award.get("naics"), award.get("psc"),
                industry_id, award["industry"].confidence, json.dumps(award["industry"].evidence), award.get("total_obligated"),
                award.get("current_value"), award.get("potential_value"), award.get("award_date"), award.get("start_date"),
                award.get("end_date"), award.get("last_modified"), performance.get("country"), performance.get("state"),
                performance.get("state_fips"), performance.get("county"), performance.get("county_fips"),
                performance.get("city"), performance.get("zip"), award.get("source_url"),
            ),
        ).fetchone()
        return row["id"], bool(row["inserted"])

    def _ingest_one(self, normalized: dict) -> dict[str, int]:
        award = normalized["award"]
        transaction = normalized["transaction"]
        industry_id = self._industry_id(award["industry"].primary_slug)
        agency_id = self._upsert_agency(award)
        company_id, company_inserted = self._upsert_company(normalized["company"], industry_id)
        award_id, award_inserted = self._upsert_award(award, company_id, industry_id, agency_id)
        award["primary_industry_id"] = industry_id
        if industry_id:
            self.connection.execute(
                """INSERT INTO award_industries (award_id,industry_id,confidence,evidence,is_primary)
                   VALUES (%s,%s,%s,%s::jsonb,true) ON CONFLICT (award_id,industry_id) DO UPDATE SET
                   confidence=EXCLUDED.confidence,evidence=EXCLUDED.evidence,is_primary=true""",
                (award_id, industry_id, award["industry"].confidence, json.dumps(award["industry"].evidence)),
            )
        transaction_row = self.connection.execute(
            """INSERT INTO transactions (source_transaction_id,award_id,action_date,action_type,modification_number,
               obligation,current_total_value,potential_total_value,description,source_last_modified)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (source_transaction_id) DO UPDATE SET award_id=EXCLUDED.award_id,action_date=EXCLUDED.action_date,
               action_type=COALESCE(EXCLUDED.action_type,transactions.action_type),
               modification_number=COALESCE(EXCLUDED.modification_number,transactions.modification_number),
               obligation=EXCLUDED.obligation,current_total_value=COALESCE(EXCLUDED.current_total_value,transactions.current_total_value),
               potential_total_value=COALESCE(EXCLUDED.potential_total_value,transactions.potential_total_value),
               description=COALESCE(EXCLUDED.description,transactions.description),
               source_last_modified=GREATEST(EXCLUDED.source_last_modified,transactions.source_last_modified)
               RETURNING (xmax=0) AS inserted""",
            (
                transaction["source_transaction_id"], award_id, transaction.get("action_date"), transaction.get("action_type"),
                transaction.get("modification_number"), transaction.get("obligation"), transaction.get("current_total_value"),
                transaction.get("potential_total_value"), transaction.get("description"), transaction.get("source_last_modified"),
            ),
        ).fetchone()
        raw_json = json.dumps(normalized["raw"], sort_keys=True, separators=(",", ":"), default=str)
        payload_hash = hashlib.sha256(raw_json.encode("utf-8")).hexdigest()
        self.connection.execute(
            """INSERT INTO raw_source_transactions (source,source_transaction_id,source_last_modified,payload)
               VALUES ('usaspending',%s,%s,%s::jsonb) ON CONFLICT (source,source_transaction_id) DO UPDATE SET
               fetched_at=now(),source_last_modified=GREATEST(EXCLUDED.source_last_modified,raw_source_transactions.source_last_modified),
               payload=EXCLUDED.payload""",
            (transaction["source_transaction_id"], transaction.get("source_last_modified"), raw_json),
        )
        self.connection.execute(
            """INSERT INTO raw_source_transaction_versions (
                 source,source_transaction_id,source_last_modified,payload_hash,payload
               ) VALUES ('usaspending',%s,%s,%s,%s::jsonb)
               ON CONFLICT (source,source_transaction_id,payload_hash) DO NOTHING""",
            (transaction["source_transaction_id"], transaction.get("source_last_modified"), payload_hash, raw_json),
        )
        recipient = normalized["company"]["recipient"]
        self.connection.execute(
            """INSERT INTO company_geography_observations (
                 company_id,source_transaction_id,recipient_address,recipient_city,recipient_county,
                 recipient_county_fips,recipient_state,recipient_state_fips,recipient_zip,recipient_country
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (company_id,source_transaction_id) DO UPDATE SET
                 observed_at=now(),recipient_address=EXCLUDED.recipient_address,recipient_city=EXCLUDED.recipient_city,
                 recipient_county=EXCLUDED.recipient_county,recipient_county_fips=EXCLUDED.recipient_county_fips,
                 recipient_state=EXCLUDED.recipient_state,recipient_state_fips=EXCLUDED.recipient_state_fips,
                 recipient_zip=EXCLUDED.recipient_zip,recipient_country=EXCLUDED.recipient_country""",
            (
                company_id, transaction["source_transaction_id"], recipient.get("address"), recipient.get("city"),
                recipient.get("county"), recipient.get("county_fips"), recipient.get("state"), recipient.get("state_fips"),
                recipient.get("zip"), recipient.get("country"),
            ),
        )
        self.connection.execute(
            """INSERT INTO company_geography_observation_versions (
                 company_id,source_transaction_id,payload_hash,recipient_address,recipient_city,recipient_county,
                 recipient_county_fips,recipient_state,recipient_state_fips,recipient_zip,recipient_country
               ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (company_id,source_transaction_id,payload_hash) DO NOTHING""",
            (
                company_id, transaction["source_transaction_id"], payload_hash, recipient.get("address"),
                recipient.get("city"), recipient.get("county"), recipient.get("county_fips"), recipient.get("state"),
                recipient.get("state_fips"), recipient.get("zip"), recipient.get("country"),
            ),
        )
        self.connection.execute(
            """INSERT INTO award_identity_observations (
                 source_transaction_id,award_id,generated_award_id,piid,recipient_uei
               ) VALUES (%s,%s,%s,%s,%s)
               ON CONFLICT (source_transaction_id) DO UPDATE SET
                 award_id=EXCLUDED.award_id,generated_award_id=EXCLUDED.generated_award_id,
                 piid=EXCLUDED.piid,recipient_uei=EXCLUDED.recipient_uei,observed_at=now()""",
            (transaction["source_transaction_id"], award_id, award["generated_award_id"], award.get("piid"), normalized["company"].get("uei")),
        )
        self.connection.execute(
            """INSERT INTO award_identity_observation_versions (
                 source_transaction_id,payload_hash,award_id,generated_award_id,piid,recipient_uei
               ) VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT (source_transaction_id,payload_hash) DO NOTHING""",
            (
                transaction["source_transaction_id"], payload_hash, award_id, award["generated_award_id"],
                award.get("piid"), normalized["company"].get("uei"),
            ),
        )
        transaction_inserted = bool(transaction_row["inserted"])
        self.upsert_us_procurement_process_and_events(
            normalized,
            company_id=company_id,
            award_id=award_id,
            award_inserted=award_inserted,
            events=derive_usaspending_events(normalized, award_inserted=award_inserted),
        )
        return {
            "records_inserted": int(transaction_inserted),
            "records_updated": int(not transaction_inserted),
            "companies_created": int(company_inserted),
            "awards_created": int(award_inserted),
            "transactions_created": int(transaction_inserted),
            "award_id": award_id,
        }

    def _refresh_award_obligations(self, award_ids: list[str]) -> None:
        if not award_ids:
            return
        self.connection.execute(
            """UPDATE awards a SET total_obligated=s.total
               FROM (
                 SELECT award_id,sum(obligation) AS total
                 FROM transactions
                 WHERE award_id=ANY(%s::uuid[])
                 GROUP BY award_id HAVING count(obligation)>0
               ) s WHERE a.id=s.award_id""",
            (list(set(award_ids)),),
        )

    def ingest_batch(
        self,
        records: list[dict],
        *,
        backfill_job_id: str | None = None,
        checkpoint: dict | None = None,
    ) -> dict[str, int]:
        """Upsert a batch and its backfill checkpoint in the same commit."""
        stats = {
            "records_inserted": 0,
            "records_updated": 0,
            "companies_created": 0,
            "awards_created": 0,
            "transactions_created": 0,
            "batches_committed": 1,
        }
        award_ids: list[str] = []
        with self.transaction():
            for normalized in records:
                result = self._ingest_one(normalized)
                award_ids.append(str(result.pop("award_id")))
                for key, value in result.items():
                    stats[key] += value
            self._refresh_award_obligations(award_ids)
            if backfill_job_id and checkpoint:
                self.connection.execute(
                    """UPDATE backfill_jobs SET status='importing',current_member=%s,member_row=%s,
                       rows_processed=%s,rows_in_window=rows_in_window+%s,batches_committed=batches_committed+1,
                       records_inserted=records_inserted+%s,records_updated=records_updated+%s,
                       companies_created=companies_created+%s,awards_created=awards_created+%s,
                       transactions_created=transactions_created+%s,updated_at=now(),error_summary=NULL
                       WHERE id=%s""",
                    (
                        checkpoint.get("member"), checkpoint.get("member_row", 0), checkpoint.get("rows_processed", 0),
                        len(records), stats["records_inserted"], stats["records_updated"], stats["companies_created"],
                        stats["awards_created"], stats["transactions_created"], backfill_job_id,
                    ),
                )
        return stats

    def ingest(self, normalized: dict) -> bool:
        """Compatibility wrapper for callers that submit one normalized row."""
        return bool(self.ingest_batch([normalized])["awards_created"])

    def create_or_resume_backfill_job(
        self,
        *,
        start_date: date,
        end_date: date,
        source_url: str,
        source_file_name: str,
        batch_size: int,
        fiscal_year: int | None = None,
        source_updated_at: datetime | None = None,
        metadata: dict | None = None,
    ) -> dict:
        self._ensure_connection()
        row = self.connection.execute(
            """INSERT INTO backfill_jobs (
                 start_date,end_date,fiscal_year,source_url,source_file_name,source_updated_at,status,batch_size,metadata
               ) VALUES (%s,%s,%s,%s,%s,%s,'queued',%s,%s::jsonb)
               ON CONFLICT (source,start_date,end_date,source_url) DO UPDATE SET
                 batch_size=EXCLUDED.batch_size,source_updated_at=COALESCE(EXCLUDED.source_updated_at,backfill_jobs.source_updated_at),
                 metadata=backfill_jobs.metadata || EXCLUDED.metadata,updated_at=now()
               RETURNING *""",
            (start_date, end_date, fiscal_year, source_url, source_file_name, source_updated_at, batch_size, json.dumps(metadata or {})),
        ).fetchone()
        self.connection.commit()
        return dict(row)

    def update_backfill_download(
        self,
        job_id: str,
        *,
        status: str = "downloading",
        bytes_downloaded: int | None = None,
        source_size_bytes: int | None = None,
        source_etag: str | None = None,
    ) -> None:
        self._ensure_connection()
        self.connection.execute(
            """UPDATE backfill_jobs SET status=%s,started_at=COALESCE(started_at,now()),
               bytes_downloaded=COALESCE(%s,bytes_downloaded),source_size_bytes=COALESCE(%s,source_size_bytes),
               source_etag=COALESCE(%s,source_etag),
               completed_at=CASE WHEN %s IN ('downloading','importing') THEN NULL ELSE completed_at END,
               updated_at=now() WHERE id=%s""",
            (status, bytes_downloaded, source_size_bytes, source_etag, status, job_id),
        )
        self.connection.commit()

    def finish_backfill_job(
        self,
        job_id: str,
        status: str,
        *,
        skipped: int = 0,
        failed: int = 0,
        error: str | None = None,
        member: str | None = None,
        member_row: int | None = None,
        rows_processed: int | None = None,
    ) -> dict:
        self._ensure_connection()
        row = self.connection.execute(
            """UPDATE backfill_jobs SET status=%s,records_skipped=records_skipped+%s,
               records_failed=records_failed+%s,completed_at=CASE WHEN %s IN ('success','partial','failed') THEN now() END,
               current_member=COALESCE(%s,current_member),member_row=COALESCE(%s,member_row),
               rows_processed=COALESCE(%s,rows_processed),updated_at=now(),error_summary=%s WHERE id=%s RETURNING *""",
            (status, skipped, failed, status, member, member_row, rows_processed, error, job_id),
        ).fetchone()
        self.connection.commit()
        return dict(row)
