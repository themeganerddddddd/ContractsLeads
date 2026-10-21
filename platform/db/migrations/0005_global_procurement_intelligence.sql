-- Global procurement, lifecycle events, and auditable intelligence foundations.
-- Existing USAspending award and transaction tables remain canonical for U.S. data.

CREATE TABLE IF NOT EXISTS organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name text NOT NULL,
    slug text NOT NULL UNIQUE,
    headquarters_country text,
    headquarters_address text,
    website text,
    mapping_status text NOT NULL DEFAULT 'unreviewed'
        CHECK (mapping_status IN ('unreviewed','reviewed','rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organizations_name_trgm_idx
    ON organizations USING gin (canonical_name gin_trgm_ops);

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS legal_entity_country text;
CREATE INDEX IF NOT EXISTS companies_organization_idx ON companies (organization_id);

CREATE TABLE IF NOT EXISTS organization_company_mappings (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','reviewed','rejected')),
    mapping_method text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by text,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, company_id)
);

CREATE TABLE IF NOT EXISTS entity_identifiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
    identifier_system text NOT NULL,
    identifier_value text NOT NULL,
    country_code text,
    source_system text NOT NULL,
    source_url text,
    is_verified boolean NOT NULL DEFAULT false,
    observed_at timestamptz NOT NULL DEFAULT now(),
    CHECK (company_id IS NOT NULL OR organization_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS entity_identifiers_company_unique
    ON entity_identifiers (company_id,upper(identifier_system),upper(identifier_value)) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS entity_identifiers_organization_unique
    ON entity_identifiers (organization_id,upper(identifier_system),upper(identifier_value)) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS entity_identifiers_lookup_idx
    ON entity_identifiers (upper(identifier_system),upper(identifier_value),country_code);

CREATE TABLE IF NOT EXISTS buyers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_country text NOT NULL,
    source_system text NOT NULL,
    source_buyer_id text NOT NULL,
    name text NOT NULL,
    identifier_scheme text,
    identifier_value text,
    address jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,source_buyer_id)
);
CREATE INDEX IF NOT EXISTS buyers_country_name_idx ON buyers (source_country,name);

CREATE TABLE IF NOT EXISTS data_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system text NOT NULL UNIQUE,
    name text NOT NULL,
    country_code text NOT NULL,
    official_url text NOT NULL,
    license_name text,
    coverage_start date,
    coverage_end date,
    update_frequency text,
    quality_status text NOT NULL DEFAULT 'unknown'
        CHECK (quality_status IN ('unknown','healthy','partial','degraded')),
    last_success_at timestamptz,
    last_attempt_at timestamptz,
    last_record_count bigint,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO data_sources (source_system,name,country_code,official_url,license_name,update_frequency,quality_status)
VALUES
 ('usaspending','USAspending.gov','US','https://www.usaspending.gov/','U.S. Government Work','daily','healthy'),
 ('uk_find_a_tender','Find a Tender OCDS','GB','https://www.find-tender.service.gov.uk/Developer/Documentation','Open Government Licence v3.0','daily','unknown')
ON CONFLICT (source_system) DO NOTHING;

CREATE TABLE IF NOT EXISTS source_checkpoints (
    source_system text NOT NULL REFERENCES data_sources(source_system),
    checkpoint_key text NOT NULL,
    checkpoint_value text,
    status text NOT NULL CHECK (status IN ('running','success','partial','failed')),
    records_seen bigint NOT NULL DEFAULT 0,
    records_written bigint NOT NULL DEFAULT 0,
    error_summary text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (source_system,checkpoint_key)
);

CREATE TABLE IF NOT EXISTS procurement_processes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_country text NOT NULL,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_process_id text NOT NULL,
    ocid text,
    buyer_id uuid REFERENCES buyers(id) ON DELETE SET NULL,
    primary_supplier_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    title text,
    description text,
    current_stage text,
    status text,
    procurement_method text,
    published_at timestamptz,
    tender_start_at timestamptz,
    tender_end_at timestamptz,
    award_date date,
    contract_start_date date,
    contract_end_date date,
    value_native numeric(20,2),
    currency text,
    value_usd numeric(20,2),
    fx_rate numeric(20,8),
    fx_rate_date date,
    fx_source_url text,
    performance_locations jsonb NOT NULL DEFAULT '[]'::jsonb,
    native_category_scheme text,
    native_category_code text,
    common_industry_id uuid REFERENCES industries(id) ON DELETE SET NULL,
    source_url text NOT NULL,
    source_last_modified timestamptz,
    is_demo boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,source_process_id),
    CHECK ((value_usd IS NULL AND fx_rate IS NULL AND fx_rate_date IS NULL AND fx_source_url IS NULL)
        OR (value_usd IS NOT NULL AND fx_rate IS NOT NULL AND fx_rate_date IS NOT NULL AND fx_source_url IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS procurement_processes_ocid_idx ON procurement_processes (ocid);
CREATE INDEX IF NOT EXISTS procurement_processes_country_date_idx
    ON procurement_processes (source_country,published_at DESC);
CREATE INDEX IF NOT EXISTS procurement_processes_supplier_date_idx
    ON procurement_processes (primary_supplier_company_id,published_at DESC);
CREATE INDEX IF NOT EXISTS procurement_processes_buyer_date_idx
    ON procurement_processes (buyer_id,published_at DESC);
CREATE INDEX IF NOT EXISTS procurement_processes_text_idx ON procurement_processes USING gin
    (to_tsvector('english',coalesce(title,'') || ' ' || coalesce(description,'')));

CREATE TABLE IF NOT EXISTS procurement_process_suppliers (
    process_id uuid NOT NULL REFERENCES procurement_processes(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    source_supplier_id text,
    is_primary boolean NOT NULL DEFAULT false,
    first_observed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (process_id,company_id)
);
CREATE INDEX IF NOT EXISTS procurement_process_suppliers_company_idx
    ON procurement_process_suppliers (company_id,process_id);

ALTER TABLE awards ADD COLUMN IF NOT EXISTS procurement_process_id uuid REFERENCES procurement_processes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS awards_procurement_process_idx ON awards (procurement_process_id);

CREATE TABLE IF NOT EXISTS procurement_process_releases (
    id bigserial PRIMARY KEY,
    process_id uuid NOT NULL REFERENCES procurement_processes(id) ON DELETE CASCADE,
    source_system text NOT NULL,
    source_release_id text NOT NULL,
    release_date timestamptz,
    tags text[] NOT NULL DEFAULT '{}',
    payload_hash text NOT NULL,
    source_url text NOT NULL,
    payload jsonb NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,source_release_id,payload_hash)
);
CREATE INDEX IF NOT EXISTS procurement_releases_process_date_idx
    ON procurement_process_releases (process_id,release_date DESC);

CREATE TABLE IF NOT EXISTS procurement_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_fingerprint text NOT NULL UNIQUE,
    source_system text NOT NULL,
    source_country text NOT NULL,
    raw_source_id text,
    process_id uuid REFERENCES procurement_processes(id) ON DELETE CASCADE,
    award_id uuid REFERENCES awards(id) ON DELETE CASCADE,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    buyer_id uuid REFERENCES buyers(id) ON DELETE SET NULL,
    event_type text NOT NULL CHECK (event_type IN (
        'planned','tender_published','tender_updated','tender_closed','award_announced','contract_signed',
        'contract_started','contract_modified','value_increased','value_decreased','option_exercised',
        'contract_completed','contract_cancelled','renewal_expected','other'
    )),
    event_at timestamptz NOT NULL,
    title text,
    description text,
    value_delta_native numeric(20,2),
    value_native numeric(20,2),
    currency text,
    source_url text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (process_id IS NOT NULL OR award_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS procurement_events_company_date_idx ON procurement_events (company_id,event_at DESC);
CREATE INDEX IF NOT EXISTS procurement_events_award_date_idx ON procurement_events (award_id,event_at DESC);
CREATE INDEX IF NOT EXISTS procurement_events_process_date_idx ON procurement_events (process_id,event_at DESC);
CREATE INDEX IF NOT EXISTS procurement_events_type_date_idx ON procurement_events (event_type,event_at DESC);

CREATE TABLE IF NOT EXISTS cpv_industry_map (
    cpv_prefix text PRIMARY KEY,
    industry_id uuid NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
    confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    mapping_method text NOT NULL DEFAULT 'reviewed_prefix',
    notes text,
    reviewed_at timestamptz
);

INSERT INTO cpv_industry_map (cpv_prefix,industry_id,confidence,notes,reviewed_at)
SELECT mapping.cpv_prefix,i.id,mapping.confidence,mapping.notes,current_timestamp
FROM (VALUES
 ('09','energy',0.90,'Energy products and fuels'),
 ('30','information-technology',0.85,'Office and computing equipment'),
 ('32','telecommunications',0.85,'Radio, television and telecommunications equipment'),
 ('33','healthcare',0.85,'Medical equipment and personal care products'),
 ('35','aerospace-defense',0.82,'Security, fire-fighting and defence equipment'),
 ('45','construction',0.95,'Construction work'),
 ('60','transportation-logistics',0.90,'Transport services'),
 ('71','architecture-engineering',0.92,'Architectural, construction and engineering services'),
 ('72','information-technology',0.95,'IT services'),
 ('73','research-science',0.90,'Research and development services'),
 ('79','professional-services',0.85,'Business services'),
 ('80','education-training',0.92,'Education and training services'),
 ('85','healthcare',0.92,'Health and social work services'),
 ('90','environmental-services',0.90,'Environmental services')
) AS mapping(cpv_prefix,industry_slug,confidence,notes)
JOIN industries i ON i.slug=mapping.industry_slug
ON CONFLICT (cpv_prefix) DO NOTHING;

CREATE TABLE IF NOT EXISTS prediction_models (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_type text NOT NULL CHECK (model_type IN ('new_award','contract_change','renewal_recompete')),
    version text NOT NULL,
    algorithm text NOT NULL,
    trained_at timestamptz NOT NULL DEFAULT now(),
    observation_start date,
    training_end date NOT NULL,
    validation_end date,
    test_end date,
    horizons integer[] NOT NULL,
    feature_names jsonb NOT NULL,
    coefficients jsonb NOT NULL,
    intercept numeric NOT NULL,
    sample_counts jsonb NOT NULL,
    metrics jsonb NOT NULL,
    probability_eligible boolean NOT NULL DEFAULT false,
    status text NOT NULL CHECK (status IN ('candidate','active','rejected','insufficient_history')),
    data_provenance jsonb NOT NULL,
    notes text,
    UNIQUE (model_type,version)
);
CREATE INDEX IF NOT EXISTS prediction_models_type_trained_idx
    ON prediction_models (model_type,trained_at DESC);

CREATE TABLE IF NOT EXISTS predictions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_fingerprint text NOT NULL UNIQUE,
    model_id uuid NOT NULL REFERENCES prediction_models(id),
    prediction_type text NOT NULL,
    as_of_date date NOT NULL,
    horizon_days integer NOT NULL CHECK (horizon_days IN (30,60,90,180,365)),
    company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
    award_id uuid REFERENCES awards(id) ON DELETE CASCADE,
    process_id uuid REFERENCES procurement_processes(id) ON DELETE CASCADE,
    probability numeric(7,6) CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1)),
    likelihood_band text CHECK (likelihood_band IS NULL OR likelihood_band IN ('low','medium','high')),
    data_sufficiency text NOT NULL CHECK (data_sufficiency IN ('sufficient','insufficient_history','failed_calibration')),
    reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
    feature_snapshot jsonb NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (company_id IS NOT NULL OR award_id IS NOT NULL OR process_id IS NOT NULL),
    CHECK ((data_sufficiency='sufficient' AND probability IS NOT NULL) OR data_sufficiency<>'sufficient')
);
CREATE INDEX IF NOT EXISTS predictions_company_date_idx ON predictions (company_id,as_of_date DESC,horizon_days);
CREATE INDEX IF NOT EXISTS predictions_award_date_idx ON predictions (award_id,as_of_date DESC,horizon_days);

CREATE TABLE IF NOT EXISTS company_momentum (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    momentum_fingerprint text NOT NULL UNIQUE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    as_of_date date NOT NULL,
    score integer CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    data_sufficiency text NOT NULL CHECK (data_sufficiency IN ('sufficient','insufficient_history')),
    components jsonb NOT NULL,
    explanation text NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id,as_of_date)
);
CREATE INDEX IF NOT EXISTS company_momentum_score_idx ON company_momentum (score DESC,as_of_date DESC);

CREATE TABLE IF NOT EXISTS company_watches (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id,company_id)
);

DROP TRIGGER IF EXISTS organizations_set_updated_at ON organizations;
CREATE TRIGGER organizations_set_updated_at BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS buyers_set_updated_at ON buyers;
CREATE TRIGGER buyers_set_updated_at BEFORE UPDATE ON buyers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS data_sources_set_updated_at ON data_sources;
CREATE TRIGGER data_sources_set_updated_at BEFORE UPDATE ON data_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS procurement_processes_set_updated_at ON procurement_processes;
CREATE TRIGGER procurement_processes_set_updated_at BEFORE UPDATE ON procurement_processes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
