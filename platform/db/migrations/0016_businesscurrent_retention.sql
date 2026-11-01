-- BusinessCurrent national coverage and archive foundations.
-- This migration is additive. It does not archive, prune, or delete source data.

CREATE TABLE IF NOT EXISTS raw_source_archives (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system text NOT NULL,
    object_key text NOT NULL,
    object_version text,
    etag text,
    content_type text NOT NULL,
    compression_type text NOT NULL CHECK (compression_type IN ('none','gzip','zstd','zip','tar_gzip')),
    sha256 char(64) NOT NULL,
    compressed_bytes bigint NOT NULL CHECK (compressed_bytes >= 0),
    uncompressed_bytes bigint NOT NULL CHECK (uncompressed_bytes >= 0),
    source_url text,
    source_period_start timestamptz,
    source_period_end timestamptz,
    fetched_at timestamptz,
    archived_at timestamptz NOT NULL DEFAULT now(),
    parser_version text,
    schema_version text NOT NULL,
    record_count bigint NOT NULL CHECK (record_count >= 0),
    verification_status text NOT NULL CHECK (verification_status IN ('pending','verified','failed')),
    verification_detail text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,object_key,sha256)
);
CREATE INDEX IF NOT EXISTS raw_source_archives_source_period_idx
    ON raw_source_archives (source_system,source_period_end DESC);

CREATE TABLE IF NOT EXISTS raw_source_archive_items (
    id bigserial PRIMARY KEY,
    archive_id uuid NOT NULL REFERENCES raw_source_archives(id) ON DELETE RESTRICT,
    source_table text NOT NULL,
    source_record_id text NOT NULL,
    source_date timestamptz,
    content_hash text NOT NULL,
    archive_object_key text NOT NULL,
    verification_status text NOT NULL CHECK (verification_status IN ('verified','failed')),
    prune_status text NOT NULL DEFAULT 'retained' CHECK (prune_status IN ('retained','eligible','pruned')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_table,source_record_id,content_hash)
);
CREATE INDEX IF NOT EXISTS raw_source_archive_items_archive_idx
    ON raw_source_archive_items (archive_id,source_table);

CREATE TABLE IF NOT EXISTS source_retention_policies (
    source_key text PRIMARY KEY,
    source_system text NOT NULL,
    source_table text NOT NULL,
    record_kind text NOT NULL CHECK (record_kind IN (
        'normalized_hot','raw_payload','version_history','derived_assessment','permanent_outcome','permanent_identity'
    )),
    hot_days integer CHECK (hot_days IS NULL OR hot_days > 0),
    archive_years integer CHECK (archive_years IS NULL OR archive_years > 0),
    archive_required boolean NOT NULL DEFAULT true,
    retain_if_only_outcome_evidence boolean NOT NULL DEFAULT true,
    enabled boolean NOT NULL DEFAULT true,
    policy_reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO source_retention_policies (
    source_key,source_system,source_table,record_kind,hot_days,archive_years,archive_required,
    retain_if_only_outcome_evidence,policy_reason
) VALUES
('usaspending_transaction_versions','usaspending','raw_source_transaction_versions','version_history',1826,10,true,true,'Keep approximately five years of searchable transaction versions; preserve older raw history in object storage.'),
('procurement_releases','global_procurement','procurement_process_releases','raw_payload',1826,10,true,true,'Keep normalized process state permanently and archive older complete release payloads.'),
('procurement_notices','eu_ted','procurement_notices','raw_payload',1826,10,true,true,'Keep normalized notice and process facts while archiving older complete notice payloads.'),
('dc_business_license_versions','dc_basic_business_licenses','business_license_versions','version_history',1826,10,true,true,'Keep current normalized license state and five years of detailed observations.'),
('permit_versions','montgomery_county_commercial_permits','development_permit_versions','version_history',1826,10,true,true,'Keep current normalized permit state and archive superseded detailed observations.'),
('establishment_evidence','business_change_sources','establishment_event_evidence','raw_payload',1826,10,true,true,'Keep material establishment events permanently while archiving older source payloads.'),
('movement_assessments','business_change_models','movement_assessments','derived_assessment',1826,10,false,true,'Assessment history is rebuildable but remains hot for model audit and must not remove sole outcome evidence.'),
('business_change_assessments','business_change_models','business_change_assessments','derived_assessment',1826,10,false,true,'Assessment history is rebuildable but remains hot for model audit and must not remove sole outcome evidence.'),
('business_change_signals','business_change_sources','business_change_signals','normalized_hot',1826,10,true,true,'Detailed signals stay hot for five years; material outcomes and evidence references remain permanent.'),
('warn_observations','state_warn','company_event_sources','raw_payload',3652,10,true,true,'WARN evidence remains hot for up to ten years because workforce events can mature slowly.'),
('confirmed_business_outcomes','business_change','business_change_outcomes','permanent_outcome',NULL,NULL,false,true,'Confirmed material business outcomes remain permanently queryable.'),
('company_identity','canonical_company','companies','permanent_identity',NULL,NULL,false,true,'Canonical company identities and official identifiers are permanent.')
ON CONFLICT (source_key) DO UPDATE SET
    source_system=EXCLUDED.source_system,
    source_table=EXCLUDED.source_table,
    record_kind=EXCLUDED.record_kind,
    hot_days=EXCLUDED.hot_days,
    archive_years=EXCLUDED.archive_years,
    archive_required=EXCLUDED.archive_required,
    retain_if_only_outcome_evidence=EXCLUDED.retain_if_only_outcome_evidence,
    policy_reason=EXCLUDED.policy_reason,
    updated_at=now();

CREATE TABLE IF NOT EXISTS company_monthly_features (
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    month date NOT NULL CHECK (month=date_trunc('month',month)::date),
    award_count integer NOT NULL DEFAULT 0,
    new_award_count integer NOT NULL DEFAULT 0,
    obligations numeric(20,2) NOT NULL DEFAULT 0,
    obligation_change numeric(20,2) NOT NULL DEFAULT 0,
    modification_count integer NOT NULL DEFAULT 0,
    buyer_count integer NOT NULL DEFAULT 0,
    new_buyer_count integer NOT NULL DEFAULT 0,
    performance_location_count integer NOT NULL DEFAULT 0,
    new_performance_location_count integer NOT NULL DEFAULT 0,
    opening_count integer NOT NULL DEFAULT 0,
    expansion_count integer NOT NULL DEFAULT 0,
    relocation_count integer NOT NULL DEFAULT 0,
    contraction_count integer NOT NULL DEFAULT 0,
    closure_count integer NOT NULL DEFAULT 0,
    positive_signal_count integer NOT NULL DEFAULT 0,
    negative_signal_count integer NOT NULL DEFAULT 0,
    industry_activity jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_families text[] NOT NULL DEFAULT '{}',
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id,month)
);

CREATE TABLE IF NOT EXISTS establishment_monthly_features (
    establishment_id uuid NOT NULL REFERENCES business_establishments(id) ON DELETE CASCADE,
    month date NOT NULL CHECK (month=date_trunc('month',month)::date),
    opening_count integer NOT NULL DEFAULT 0,
    expansion_count integer NOT NULL DEFAULT 0,
    relocation_count integer NOT NULL DEFAULT 0,
    contraction_count integer NOT NULL DEFAULT 0,
    closure_count integer NOT NULL DEFAULT 0,
    license_observation_count integer NOT NULL DEFAULT 0,
    permit_observation_count integer NOT NULL DEFAULT 0,
    workforce_event_count integer NOT NULL DEFAULT 0,
    positive_signal_count integer NOT NULL DEFAULT 0,
    negative_signal_count integer NOT NULL DEFAULT 0,
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (establishment_id,month)
);

CREATE TABLE IF NOT EXISTS geography_industry_monthly_features (
    country_code text NOT NULL,
    state_code text NOT NULL DEFAULT '',
    county_fips text NOT NULL DEFAULT '',
    city text NOT NULL DEFAULT '',
    industry_code text NOT NULL DEFAULT '',
    month date NOT NULL CHECK (month=date_trunc('month',month)::date),
    openings integer NOT NULL DEFAULT 0,
    closures integer NOT NULL DEFAULT 0,
    expansions integer NOT NULL DEFAULT 0,
    contractions integer NOT NULL DEFAULT 0,
    moves integer NOT NULL DEFAULT 0,
    new_registrations integer NOT NULL DEFAULT 0,
    license_observations integer NOT NULL DEFAULT 0,
    permit_observations integer NOT NULL DEFAULT 0,
    warn_events integer NOT NULL DEFAULT 0,
    positive_signals integer NOT NULL DEFAULT 0,
    negative_signals integer NOT NULL DEFAULT 0,
    business_change_activity integer NOT NULL DEFAULT 0,
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (country_code,state_code,county_fips,city,industry_code,month)
);

CREATE TABLE IF NOT EXISTS feature_exports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset text NOT NULL CHECK (dataset IN (
        'company_monthly_features','establishment_monthly_features','geography_industry_monthly_features'
    )),
    period_start date NOT NULL,
    period_end date NOT NULL,
    object_key text NOT NULL,
    object_version text,
    etag text,
    sha256 char(64) NOT NULL,
    row_count bigint NOT NULL CHECK (row_count >= 0),
    compressed_bytes bigint NOT NULL CHECK (compressed_bytes >= 0),
    schema_version text NOT NULL,
    verification_status text NOT NULL CHECK (verification_status IN ('pending','verified','failed')),
    exported_at timestamptz NOT NULL DEFAULT now(),
    CHECK (period_end >= period_start),
    UNIQUE (dataset,period_start,period_end,sha256)
);
CREATE INDEX IF NOT EXISTS feature_exports_dataset_period_idx
    ON feature_exports (dataset,period_end DESC);

CREATE TABLE IF NOT EXISTS national_source_coverage (
    state_code char(2) NOT NULL,
    source_family text NOT NULL CHECK (source_family IN (
        'registrations','licenses','permits','occupancy','warn','economic_development','government_business'
    )),
    coverage_status text NOT NULL CHECK (coverage_status IN (
        'available','partial','blocked','manual','unsupported','planned','active'
    )),
    source_name text,
    source_url text,
    reuse_status text NOT NULL DEFAULT 'unverified' CHECK (reuse_status IN (
        'permitted','restricted','unverified','not_applicable'
    )),
    automation_status text NOT NULL DEFAULT 'planned' CHECK (automation_status IN (
        'planned','identified','terms_verified','adapter_built','tested','production','blocked','manual'
    )),
    refresh_frequency text,
    last_successful_collection timestamptz,
    known_limitations text NOT NULL,
    priority_score numeric(6,2),
    priority_factors jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (state_code,source_family)
);

WITH states(state_code) AS (VALUES
    ('AL'),('AK'),('AZ'),('AR'),('CA'),('CO'),('CT'),('DE'),('FL'),('GA'),('HI'),('ID'),('IL'),('IN'),
    ('IA'),('KS'),('KY'),('LA'),('ME'),('MD'),('MA'),('MI'),('MN'),('MS'),('MO'),('MT'),('NE'),('NV'),
    ('NH'),('NJ'),('NM'),('NY'),('NC'),('ND'),('OH'),('OK'),('OR'),('PA'),('RI'),('SC'),('SD'),('TN'),
    ('TX'),('UT'),('VT'),('VA'),('WA'),('WV'),('WI'),('WY'),('DC')
), families(source_family) AS (VALUES
    ('registrations'),('licenses'),('permits'),('occupancy'),('warn'),('economic_development'),('government_business')
)
INSERT INTO national_source_coverage (
    state_code,source_family,coverage_status,reuse_status,automation_status,known_limitations
)
SELECT state_code,source_family,
       CASE WHEN source_family='government_business' THEN 'active' ELSE 'planned' END,
       CASE WHEN source_family='government_business' THEN 'permitted' ELSE 'unverified' END,
       CASE WHEN source_family='government_business' THEN 'production' ELSE 'planned' END,
       CASE WHEN source_family='government_business'
            THEN 'Nationwide federal procurement coverage; recipient and performance locations are not verified establishments.'
            ELSE 'Official source, reuse terms, and automation have not yet been verified for this state and family.' END
FROM states CROSS JOIN families
ON CONFLICT (state_code,source_family) DO NOTHING;

UPDATE national_source_coverage SET
    coverage_status='active',source_name='Maryland WARN / ESA / Other Dislocations Log',
    source_url='https://www.labor.maryland.gov/employment/warn.shtml',reuse_status='unverified',
    automation_status='production',refresh_frequency='as published',
    known_limitations='State workforce reductions only; inclusion does not independently prove a company-wide closure.',updated_at=now()
WHERE state_code='MD' AND source_family='warn';

UPDATE national_source_coverage SET
    coverage_status='active',source_name='Virginia Works WARN Notices',
    source_url='https://virginiaworks.gov/im-an-employer/retain-and-grow/warn-notices/',reuse_status='unverified',
    automation_status='production',refresh_frequency='as published',
    known_limitations='State workforce reductions only; published company addresses are not promoted to affected worksites or headquarters.',updated_at=now()
WHERE state_code='VA' AND source_family='warn';

UPDATE national_source_coverage SET
    coverage_status='active',source_name='Maryland Department of Commerce Press Room',
    source_url='https://commerce.maryland.gov/press-room',reuse_status='unverified',
    automation_status='production',refresh_frequency='as published',
    known_limitations='Official announcements only; announced jobs and investments are not completed outcomes.',updated_at=now()
WHERE state_code='MD' AND source_family='economic_development';

UPDATE national_source_coverage SET
    coverage_status='partial',source_name='Montgomery County Commercial Permits',
    source_url='https://data.montgomerycountymd.gov/d/i26v-w6bd',reuse_status='permitted',
    automation_status='production',refresh_frequency='daily',
    known_limitations='Coverage is limited to Montgomery County; permit records do not independently prove the occupant.',updated_at=now()
WHERE state_code='MD' AND source_family='permits';

UPDATE national_source_coverage SET
    coverage_status='partial',source_name='DC Basic Business Licenses',
    source_url='https://opendata.dc.gov/',reuse_status='permitted',
    automation_status='production',refresh_frequency='source dependent',
    known_limitations='License coverage is not a complete registry of every operating establishment.',updated_at=now()
WHERE state_code='DC' AND source_family='licenses';

ALTER TABLE location_monitor_targets ADD COLUMN IF NOT EXISTS industry_code text;
ALTER TABLE location_monitor_targets ADD COLUMN IF NOT EXISTS saved_filter jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS saved_market_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    name text NOT NULL,
    filters jsonb NOT NULL,
    tracking_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id,name)
);
