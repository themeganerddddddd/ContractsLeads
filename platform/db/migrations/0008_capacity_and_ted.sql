-- Capacity-governed historical loading and EU TED notice/lot/contract support.
-- EU is a source market; source_country remains the actual buyer/record country.

ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS source_market text;
UPDATE data_sources SET source_market=CASE source_system
  WHEN 'usaspending' THEN 'US_FEDERAL'
  WHEN 'uk_find_a_tender' THEN 'UK_FTS'
  ELSE source_system
END WHERE source_market IS NULL;
ALTER TABLE data_sources ALTER COLUMN source_market SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS data_sources_market_idx ON data_sources (source_market);

ALTER TABLE buyers ADD COLUMN IF NOT EXISTS source_market text;
ALTER TABLE buyers ALTER COLUMN source_country DROP NOT NULL;
UPDATE buyers SET source_market=CASE source_system
  WHEN 'usaspending' THEN 'US_FEDERAL'
  WHEN 'uk_find_a_tender' THEN 'UK_FTS'
  ELSE source_system
END WHERE source_market IS NULL;
ALTER TABLE buyers ALTER COLUMN source_market SET NOT NULL;
ALTER TABLE buyers ALTER COLUMN source_market SET DEFAULT 'US_FEDERAL';
CREATE INDEX IF NOT EXISTS buyers_market_country_name_idx ON buyers (source_market,source_country,name);

ALTER TABLE procurement_processes ADD COLUMN IF NOT EXISTS source_market text;
ALTER TABLE procurement_processes ALTER COLUMN source_country DROP NOT NULL;
UPDATE procurement_processes SET source_market=CASE source_system
  WHEN 'usaspending' THEN 'US_FEDERAL'
  WHEN 'uk_find_a_tender' THEN 'UK_FTS'
  ELSE source_system
END WHERE source_market IS NULL;
ALTER TABLE procurement_processes ALTER COLUMN source_market SET NOT NULL;
ALTER TABLE procurement_processes ALTER COLUMN source_market SET DEFAULT 'US_FEDERAL';
CREATE INDEX IF NOT EXISTS procurement_processes_market_date_idx
  ON procurement_processes (source_market,published_at DESC);

ALTER TABLE procurement_events ADD COLUMN IF NOT EXISTS source_market text;
ALTER TABLE procurement_events ALTER COLUMN source_country DROP NOT NULL;
UPDATE procurement_events SET source_market=CASE source_system
  WHEN 'usaspending' THEN 'US_FEDERAL'
  WHEN 'uk_find_a_tender' THEN 'UK_FTS'
  ELSE source_system
END WHERE source_market IS NULL;
ALTER TABLE procurement_events ALTER COLUMN source_market SET NOT NULL;
ALTER TABLE procurement_events ALTER COLUMN source_market SET DEFAULT 'US_FEDERAL';
CREATE INDEX IF NOT EXISTS procurement_events_market_date_idx
  ON procurement_events (source_market,event_at DESC);

ALTER TABLE procurement_events DROP CONSTRAINT IF EXISTS procurement_events_event_type_check;
ALTER TABLE procurement_events ADD CONSTRAINT procurement_events_event_type_check CHECK (event_type IN (
  'planned','planning_notice','tender_published','tender_updated','tender_changed','tender_closed',
  'award_announced','contract_signed','contract_started','contract_modified','contract_extended',
  'end_date_changed','scope_changed','notice_changed','value_increased','value_decreased',
  'option_exercised','contract_completed','contract_cancelled','renewal_expected','other'
));

INSERT INTO data_sources (
  source_system,name,country_code,source_market,official_url,license_name,update_frequency,quality_status,metadata
) VALUES (
  'eu_ted','Tenders Electronic Daily','EU','EU_TED','https://ted.europa.eu/',
  'European Commission reuse notice','daily','unknown',
  '{"search_api":"https://api.ted.europa.eu/v3/notices/search","bulk_packages":"https://ted.europa.eu/en/help/data-reuse"}'::jsonb
)
ON CONFLICT (source_system) DO UPDATE SET
  source_market=EXCLUDED.source_market,official_url=EXCLUDED.official_url,metadata=data_sources.metadata || EXCLUDED.metadata;

CREATE TABLE IF NOT EXISTS procurement_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES procurement_processes(id) ON DELETE CASCADE,
  source_system text NOT NULL REFERENCES data_sources(source_system),
  source_market text NOT NULL,
  source_notice_id text NOT NULL,
  publication_number text,
  notice_version text NOT NULL DEFAULT '1',
  notice_type text,
  notice_subtype text,
  form_type text,
  language_codes text[] NOT NULL DEFAULT '{}',
  publication_date date,
  dispatch_date date,
  change_notice_id text,
  previous_notice_id text,
  source_url text NOT NULL,
  xml_url text,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_system,source_notice_id,notice_version,payload_hash)
);
CREATE INDEX IF NOT EXISTS procurement_notices_process_date_idx
  ON procurement_notices (process_id,publication_date DESC);
CREATE INDEX IF NOT EXISTS procurement_notices_market_date_idx
  ON procurement_notices (source_market,publication_date DESC);
CREATE INDEX IF NOT EXISTS procurement_notices_publication_number_idx
  ON procurement_notices (publication_number);

CREATE TABLE IF NOT EXISTS procurement_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES procurement_processes(id) ON DELETE CASCADE,
  source_system text NOT NULL,
  source_lot_id text NOT NULL,
  title text,
  description text,
  status text,
  value_native numeric(20,2),
  currency text,
  cpv_codes text[] NOT NULL DEFAULT '{}',
  performance_countries text[] NOT NULL DEFAULT '{}',
  nuts_codes text[] NOT NULL DEFAULT '{}',
  tender_deadline timestamptz,
  source_url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_id,source_lot_id)
);
CREATE INDEX IF NOT EXISTS procurement_lots_country_idx ON procurement_lots USING gin (performance_countries);
CREATE INDEX IF NOT EXISTS procurement_lots_nuts_idx ON procurement_lots USING gin (nuts_codes);
CREATE INDEX IF NOT EXISTS procurement_lots_cpv_idx ON procurement_lots USING gin (cpv_codes);

CREATE TABLE IF NOT EXISTS procurement_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES procurement_processes(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES procurement_lots(id) ON DELETE SET NULL,
  source_system text NOT NULL,
  source_contract_id text NOT NULL,
  title text,
  status text,
  signed_at date,
  start_date date,
  end_date date,
  value_native numeric(20,2),
  currency text,
  source_url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (process_id,source_contract_id)
);
CREATE INDEX IF NOT EXISTS procurement_contracts_process_idx ON procurement_contracts (process_id,signed_at DESC);

CREATE TABLE IF NOT EXISTS capacity_observations (
  id bigserial PRIMARY KEY,
  source_system text,
  operation text NOT NULL,
  chunk_key text,
  database_bytes bigint NOT NULL,
  capacity_bytes bigint,
  utilization numeric(8,6),
  warning_threshold numeric(8,6) NOT NULL,
  stop_threshold numeric(8,6) NOT NULL,
  decision text NOT NULL CHECK (decision IN ('safe','warning','stop','unconfigured')),
  table_bytes jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS capacity_observations_date_idx ON capacity_observations (observed_at DESC);
CREATE INDEX IF NOT EXISTS capacity_observations_operation_idx ON capacity_observations (operation,observed_at DESC);

CREATE TABLE IF NOT EXISTS ingestion_chunk_metrics (
  id bigserial PRIMARY KEY,
  source_system text NOT NULL,
  operation text NOT NULL,
  chunk_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','success','partial','controlled_stop','failed')),
  records_seen bigint NOT NULL DEFAULT 0,
  records_written bigint NOT NULL DEFAULT 0,
  bytes_before bigint,
  bytes_after bigint,
  estimated_remaining_records bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (source_system,operation,chunk_key)
);
