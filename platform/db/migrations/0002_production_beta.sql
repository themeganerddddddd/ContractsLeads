-- Production beta hardening: restart-safe backfills, observability, QA evidence,
-- benchmark isolation, and indexes for the public aggregate queries.

ALTER TABLE ingestion_runs
    ALTER COLUMN records_requested TYPE bigint,
    ALTER COLUMN records_received TYPE bigint,
    ALTER COLUMN records_inserted TYPE bigint,
    ALTER COLUMN records_updated TYPE bigint,
    ALTER COLUMN records_failed TYPE bigint,
    ADD COLUMN IF NOT EXISTS records_skipped bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS companies_created bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS awards_created bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS transactions_created bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS batches_committed bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS duration_ms bigint,
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_benchmark boolean NOT NULL DEFAULT false;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS is_benchmark boolean NOT NULL DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_benchmark boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS backfill_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source text NOT NULL DEFAULT 'usaspending_monthly_archive',
    start_date date NOT NULL,
    end_date date NOT NULL,
    fiscal_year integer,
    source_url text NOT NULL,
    source_file_name text NOT NULL,
    source_updated_at timestamptz,
    source_etag text,
    source_size_bytes bigint,
    status text NOT NULL CHECK (status IN ('queued','downloading','importing','success','partial','failed')),
    current_member text,
    member_row bigint NOT NULL DEFAULT 0,
    rows_processed bigint NOT NULL DEFAULT 0,
    rows_in_window bigint NOT NULL DEFAULT 0,
    batches_committed bigint NOT NULL DEFAULT 0,
    records_inserted bigint NOT NULL DEFAULT 0,
    records_updated bigint NOT NULL DEFAULT 0,
    records_skipped bigint NOT NULL DEFAULT 0,
    records_failed bigint NOT NULL DEFAULT 0,
    companies_created bigint NOT NULL DEFAULT 0,
    awards_created bigint NOT NULL DEFAULT 0,
    transactions_created bigint NOT NULL DEFAULT 0,
    bytes_downloaded bigint NOT NULL DEFAULT 0,
    batch_size integer NOT NULL CHECK (batch_size > 0),
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    error_summary text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (source, start_date, end_date, source_url)
);
CREATE INDEX IF NOT EXISTS backfill_jobs_status_updated_idx ON backfill_jobs (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS backfill_jobs_window_idx ON backfill_jobs (start_date, end_date);

-- Keep every distinct source observation so QA can distinguish a source change
-- from a company-resolution or ingestion defect.
CREATE TABLE IF NOT EXISTS company_geography_observations (
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    source_transaction_id text NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT now(),
    recipient_address text,
    recipient_city text,
    recipient_county text,
    recipient_county_fips text,
    recipient_state text,
    recipient_state_fips text,
    recipient_zip text,
    recipient_country text,
    PRIMARY KEY (company_id, source_transaction_id)
);
CREATE INDEX IF NOT EXISTS company_geography_observations_fips_idx
    ON company_geography_observations (recipient_state, recipient_county_fips);

CREATE TABLE IF NOT EXISTS award_identity_observations (
    source_transaction_id text PRIMARY KEY,
    award_id uuid NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
    generated_award_id text,
    piid text,
    recipient_uei text,
    observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS award_identity_observations_piid_idx
    ON award_identity_observations (piid);

CREATE INDEX IF NOT EXISTS awards_recipient_date_idx
    ON awards (recipient_company_id, award_date DESC);
CREATE INDEX IF NOT EXISTS awards_performance_county_date_idx
    ON awards (performance_county_fips, award_date DESC);
CREATE INDEX IF NOT EXISTS awards_performance_state_date_idx
    ON awards (performance_state, award_date DESC);
CREATE INDEX IF NOT EXISTS awards_industry_date_idx
    ON awards (primary_industry_id, award_date DESC);
CREATE INDEX IF NOT EXISTS awards_agency_date_idx
    ON awards (awarding_agency, award_date DESC);
CREATE INDEX IF NOT EXISTS awards_amount_sort_idx
    ON awards ((COALESCE(potential_value,current_value,total_obligated)) DESC);
CREATE INDEX IF NOT EXISTS transactions_award_date_idx
    ON transactions (award_id, action_date DESC);
CREATE INDEX IF NOT EXISTS companies_recipient_county_name_idx
    ON companies (recipient_county_fips, canonical_name);
CREATE INDEX IF NOT EXISTS companies_benchmark_idx ON companies (is_benchmark) WHERE is_benchmark;
CREATE INDEX IF NOT EXISTS awards_benchmark_idx ON awards (is_benchmark) WHERE is_benchmark;
CREATE INDEX IF NOT EXISTS transactions_benchmark_idx ON transactions (is_benchmark) WHERE is_benchmark;

-- Annual aggregates intentionally use transaction action dates and transaction
-- obligations. Joining annualized transactions avoids double-counting an award's
-- lifetime total in every profile or geography group.
CREATE OR REPLACE VIEW annual_company_activity AS
SELECT extract(year FROM t.action_date)::integer AS calendar_year,
       a.recipient_company_id AS company_id,
       count(DISTINCT a.id) AS award_count,
       count(*) AS transaction_count,
       sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS disclosed_obligations
FROM transactions t
JOIN awards a ON a.id=t.award_id
WHERE NOT t.is_demo AND NOT t.is_benchmark AND NOT a.is_demo AND NOT a.is_benchmark
  AND t.action_date IS NOT NULL
GROUP BY extract(year FROM t.action_date)::integer,a.recipient_company_id;

CREATE OR REPLACE VIEW annual_agency_activity AS
SELECT extract(year FROM t.action_date)::integer AS calendar_year,
       a.awarding_agency,
       count(DISTINCT a.id) AS award_count,
       count(*) AS transaction_count,
       sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS disclosed_obligations
FROM transactions t
JOIN awards a ON a.id=t.award_id
WHERE NOT t.is_demo AND NOT t.is_benchmark AND NOT a.is_demo AND NOT a.is_benchmark
  AND t.action_date IS NOT NULL
GROUP BY extract(year FROM t.action_date)::integer,a.awarding_agency;

CREATE OR REPLACE VIEW annual_industry_activity AS
SELECT extract(year FROM t.action_date)::integer AS calendar_year,
       a.primary_industry_id AS industry_id,
       count(DISTINCT a.id) AS award_count,
       count(*) AS transaction_count,
       sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS disclosed_obligations
FROM transactions t
JOIN awards a ON a.id=t.award_id
WHERE NOT t.is_demo AND NOT t.is_benchmark AND NOT a.is_demo AND NOT a.is_benchmark
  AND t.action_date IS NOT NULL
GROUP BY extract(year FROM t.action_date)::integer,a.primary_industry_id;

CREATE OR REPLACE VIEW annual_market_activity AS
SELECT extract(year FROM t.action_date)::integer AS calendar_year,'recipient'::text AS geography,
       c.recipient_state AS state,c.recipient_county_fips AS county_fips,
       count(DISTINCT c.id) AS company_count,count(DISTINCT a.id) AS award_count,count(*) AS transaction_count,
       sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS disclosed_obligations
FROM transactions t JOIN awards a ON a.id=t.award_id JOIN companies c ON c.id=a.recipient_company_id
WHERE NOT t.is_demo AND NOT t.is_benchmark AND NOT a.is_demo AND NOT a.is_benchmark
  AND t.action_date IS NOT NULL AND c.recipient_county_fips IS NOT NULL
GROUP BY extract(year FROM t.action_date)::integer,c.recipient_state,c.recipient_county_fips
UNION ALL
SELECT extract(year FROM t.action_date)::integer,'performance'::text,
       a.performance_state,a.performance_county_fips,
       count(DISTINCT c.id),count(DISTINCT a.id),count(*),
       sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL)
FROM transactions t JOIN awards a ON a.id=t.award_id JOIN companies c ON c.id=a.recipient_company_id
WHERE NOT t.is_demo AND NOT t.is_benchmark AND NOT a.is_demo AND NOT a.is_benchmark
  AND t.action_date IS NOT NULL AND a.performance_county_fips IS NOT NULL
GROUP BY extract(year FROM t.action_date)::integer,a.performance_state,a.performance_county_fips;
