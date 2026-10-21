CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS industries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    slug text NOT NULL UNIQUE,
    description text
);

CREATE TABLE IF NOT EXISTS agencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    slug text NOT NULL UNIQUE,
    code text,
    parent_department text
);

CREATE TABLE IF NOT EXISTS companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    uei text,
    cage_code text,
    legal_name text NOT NULL,
    canonical_name text NOT NULL,
    slug text NOT NULL UNIQUE,
    parent_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    ultimate_parent_uei text,
    recipient_address text,
    recipient_city text,
    recipient_county text,
    recipient_county_fips text,
    recipient_state text,
    recipient_state_fips text,
    recipient_zip text,
    recipient_country text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    primary_industry_id uuid REFERENCES industries(id) ON DELETE SET NULL,
    website text,
    business_size text,
    small_business boolean,
    woman_owned boolean,
    veteran_owned boolean,
    hubzone boolean,
    eight_a boolean,
    first_seen date,
    last_seen date,
    is_demo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_uei_unique
    ON companies (upper(uei)) WHERE uei IS NOT NULL AND btrim(uei) <> '';
CREATE INDEX IF NOT EXISTS companies_recipient_state_idx ON companies (recipient_state);
CREATE INDEX IF NOT EXISTS companies_recipient_county_idx ON companies (recipient_county_fips);
CREATE INDEX IF NOT EXISTS companies_recipient_city_idx ON companies (lower(recipient_city));
CREATE INDEX IF NOT EXISTS companies_recipient_zip_idx ON companies (recipient_zip);
CREATE INDEX IF NOT EXISTS companies_primary_industry_idx ON companies (primary_industry_id);
CREATE INDEX IF NOT EXISTS companies_name_trgm_idx ON companies USING gin (canonical_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS awards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    generated_award_id text,
    piid text,
    parent_award_id text,
    recipient_company_id uuid NOT NULL REFERENCES companies(id),
    award_type text,
    title text,
    description text,
    awarding_department text,
    awarding_agency text,
    awarding_subagency text,
    agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
    naics text,
    psc text,
    primary_industry_id uuid REFERENCES industries(id) ON DELETE SET NULL,
    classification_confidence numeric(4,3),
    classification_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_obligated numeric(20,2),
    current_value numeric(20,2),
    potential_value numeric(20,2),
    award_date date,
    start_date date,
    end_date date,
    last_modified timestamptz,
    performance_country text,
    performance_state text,
    performance_state_fips text,
    performance_county text,
    performance_county_fips text,
    performance_city text,
    performance_zip text,
    source_url text,
    is_demo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS awards_generated_award_id_unique
    ON awards (generated_award_id) WHERE generated_award_id IS NOT NULL AND btrim(generated_award_id) <> '';
CREATE INDEX IF NOT EXISTS awards_recipient_company_idx ON awards (recipient_company_id);
CREATE INDEX IF NOT EXISTS awards_award_date_idx ON awards (award_date DESC);
CREATE INDEX IF NOT EXISTS awards_last_modified_idx ON awards (last_modified DESC);
CREATE INDEX IF NOT EXISTS awards_naics_idx ON awards (naics);
CREATE INDEX IF NOT EXISTS awards_psc_idx ON awards (psc);
CREATE INDEX IF NOT EXISTS awards_primary_industry_idx ON awards (primary_industry_id);
CREATE INDEX IF NOT EXISTS awards_performance_state_idx ON awards (performance_state);
CREATE INDEX IF NOT EXISTS awards_performance_county_idx ON awards (performance_county_fips);
CREATE INDEX IF NOT EXISTS awards_performance_city_idx ON awards (lower(performance_city));
CREATE INDEX IF NOT EXISTS awards_performance_zip_idx ON awards (performance_zip);
CREATE INDEX IF NOT EXISTS awards_awarding_agency_idx ON awards (awarding_agency);
CREATE INDEX IF NOT EXISTS awards_search_idx ON awards USING gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(piid, '') || ' ' || coalesce(generated_award_id, ''))
);

CREATE TABLE IF NOT EXISTS transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_transaction_id text NOT NULL UNIQUE,
    award_id uuid NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
    action_date date,
    action_type text,
    modification_number text,
    obligation numeric(20,2),
    current_total_value numeric(20,2),
    potential_total_value numeric(20,2),
    description text,
    source_last_modified timestamptz,
    is_demo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_award_idx ON transactions (award_id);
CREATE INDEX IF NOT EXISTS transactions_action_date_idx ON transactions (action_date DESC);
CREATE INDEX IF NOT EXISTS transactions_source_modified_idx ON transactions (source_last_modified DESC);

CREATE TABLE IF NOT EXISTS award_industries (
    award_id uuid NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
    industry_id uuid NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
    confidence numeric(4,3) NOT NULL,
    evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_primary boolean NOT NULL DEFAULT false,
    PRIMARY KEY (award_id, industry_id)
);

CREATE TABLE IF NOT EXISTS naics_industry_map (
    naics text PRIMARY KEY,
    industry_id uuid NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
    confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE IF NOT EXISTS psc_industry_map (
    psc text PRIMARY KEY,
    industry_id uuid NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
    confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    status text NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
    source text NOT NULL,
    records_requested integer NOT NULL DEFAULT 0,
    records_received integer NOT NULL DEFAULT 0,
    records_inserted integer NOT NULL DEFAULT 0,
    records_updated integer NOT NULL DEFAULT 0,
    records_failed integer NOT NULL DEFAULT 0,
    start_checkpoint timestamptz,
    end_checkpoint timestamptz,
    error_summary text
);
CREATE INDEX IF NOT EXISTS ingestion_runs_source_status_idx ON ingestion_runs (source, status, completed_at DESC);

CREATE TABLE IF NOT EXISTS raw_source_transactions (
    id bigserial PRIMARY KEY,
    source text NOT NULL,
    source_transaction_id text NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    source_last_modified timestamptz,
    payload jsonb NOT NULL,
    UNIQUE (source, source_transaction_id)
);

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_auth_id text UNIQUE,
    email text NOT NULL UNIQUE,
    name text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_customer_id text,
    provider_subscription_id text,
    plan text NOT NULL,
    status text NOT NULL,
    period_start timestamptz,
    period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_subscription_id)
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions (user_id, status);

CREATE TABLE IF NOT EXISTS saved_searches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    query_json jsonb NOT NULL,
    alert_frequency text CHECK (alert_frequency IN ('none', 'weekly', 'daily')) DEFAULT 'none',
    last_run timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_searches_user_idx ON saved_searches (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS exports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    format text NOT NULL CHECK (format IN ('csv', 'xlsx')),
    row_count integer NOT NULL CHECK (row_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exports_user_month_idx ON exports (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stripe_events (
    id text PRIMARY KEY,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_set_updated_at ON companies;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS awards_set_updated_at ON awards;
CREATE TRIGGER awards_set_updated_at BEFORE UPDATE ON awards
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS transactions_set_updated_at ON transactions;
CREATE TRIGGER transactions_set_updated_at BEFORE UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS saved_searches_set_updated_at ON saved_searches;
CREATE TRIGGER saved_searches_set_updated_at BEFORE UPDATE ON saved_searches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
