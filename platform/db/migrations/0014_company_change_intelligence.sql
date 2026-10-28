-- Additive company-change intelligence architecture. Existing movement-indication-v1
-- rows are retained verbatim; only the allowed vocabulary is expanded for v2 rows.

ALTER TABLE movement_assessments
    DROP CONSTRAINT IF EXISTS movement_assessments_assessment_type_check;
ALTER TABLE movement_assessments
    ADD CONSTRAINT movement_assessments_assessment_type_check CHECK (assessment_type IN (
        'expansion','relocation','growth','contraction','market_entry','closure_distress','formation','activity'
    ));

ALTER TABLE prediction_models
    DROP CONSTRAINT IF EXISTS prediction_models_model_type_check;
ALTER TABLE prediction_models
    ADD CONSTRAINT prediction_models_model_type_check CHECK (model_type IN (
        'new_award','contract_change','renewal_recompete','company_expansion','company_relocation',
        'company_growth','company_contraction','business_formation'
    ));

ALTER TABLE alert_events DROP CONSTRAINT IF EXISTS alert_events_alert_type_check;
ALTER TABLE alert_events ADD CONSTRAINT alert_events_alert_type_check CHECK (alert_type IN (
    'new_award','contract_modified','procurement_event','movement_event','permit_event','sec_filing',
    'saved_search_match','region_event','indication_strengthened','formation_surge',
    'confirmed_expansion','confirmed_relocation','confirmed_closure'
));

ALTER TABLE company_discoveries DROP CONSTRAINT IF EXISTS company_discoveries_discovery_reason_check;
ALTER TABLE company_discoveries ADD CONSTRAINT company_discoveries_discovery_reason_check CHECK (discovery_reason IN (
    'new_award','contract_change','movement_signal','permit_signal','sec_signal','saved_search_match',
    'expansion_indication','relocation_indication','growth_indication','contraction_indication',
    'early_growth_indication','other'
));

CREATE TABLE IF NOT EXISTS outcome_definition_versions (
    definition_version text PRIMARY KEY,
    outcome_type text NOT NULL,
    unit_type text NOT NULL CHECK (unit_type IN ('company','geography_industry')),
    positive_definition text NOT NULL,
    exclusions text NOT NULL,
    qualifying_event_types text[] NOT NULL,
    requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
    effective_from date NOT NULL,
    retired_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO outcome_definition_versions (
    definition_version,outcome_type,unit_type,positive_definition,exclusions,qualifying_event_types,requirements,effective_from
) VALUES
('company-expansion-v1','expansion','company',
 'Source-backed new or expanded facility, material job creation, capital investment tied to expansion, new operating location, or market entry.',
 'A contract award or funding event alone is supporting evidence, not a confirmed expansion.',
 ARRAY['expansion','facility_expansion','new_facility','opening','market_entry'],
 '{"requires_verified_company_relationship":true,"requires_source_url":true}'::jsonb,'2026-01-01'),
('company-relocation-v1','relocation','company',
 'Source-backed movement of an operation, facility, or headquarters from an origin geography to a destination geography.',
 'A new facility without an evidenced origin move is not relocation.',
 ARRAY['relocation','headquarters_move'],
 '{"requires_origin":true,"requires_destination":true,"requires_verified_company_relationship":true}'::jsonb,'2026-01-01'),
('company-growth-v1','growth','company',
 'Source-backed sustained company trajectory growth from workforce, facilities, investment, market, or government-business evidence.',
 'A single contract award is not a confirmed company-growth outcome.',
 ARRAY['hiring','expansion','facility_expansion','investment','market_entry'],
 '{"requires_corroboration":true}'::jsonb,'2026-01-01'),
('company-contraction-v1','contraction','company',
 'Source-backed layoff, facility consolidation, material downsizing, closure, bankruptcy, or restructuring.',
 'A single deobligation is not a confirmed company-contraction outcome.',
 ARRAY['layoff','closure','furlough','consolidation','bankruptcy','restructuring'],
 '{"requires_verified_company_relationship":true}'::jsonb,'2026-01-01'),
('business-formation-v1','formation','geography_industry',
 'A new legal entity first appearing in a legally usable official business-registration source.',
 'Unverified directories, inferred companies, and procurement first-seen dates are not formation labels.',
 ARRAY[]::text[],
 '{"requires_official_registration":true,"company_id_optional_until_resolution":true}'::jsonb,'2026-01-01')
ON CONFLICT (definition_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS business_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_fingerprint text NOT NULL UNIQUE,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    official_identifier text NOT NULL,
    legal_name text NOT NULL,
    formation_date date,
    registration_date date,
    status text,
    entity_type text,
    registered_address_line text,
    city text,
    county text,
    county_fips text,
    state_code text,
    postal_code text,
    country_code text NOT NULL,
    industry_code text,
    industry_label text,
    source_url text NOT NULL,
    observed_at timestamptz NOT NULL,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    resolution_status text NOT NULL DEFAULT 'unresolved' CHECK (resolution_status IN (
        'unresolved','candidate','auto_verified','approved','rejected'
    )),
    resolution_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_observed_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,official_identifier)
);
CREATE INDEX IF NOT EXISTS business_registrations_formation_idx
    ON business_registrations (country_code,state_code,county_fips,formation_date DESC);
CREATE INDEX IF NOT EXISTS business_registrations_resolution_idx
    ON business_registrations (resolution_status,observed_at DESC);

CREATE TABLE IF NOT EXISTS company_outcomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outcome_fingerprint text NOT NULL UNIQUE,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    definition_version text NOT NULL REFERENCES outcome_definition_versions(definition_version),
    outcome_type text NOT NULL CHECK (outcome_type IN (
        'expansion','relocation','growth','contraction','market_entry','closure','new_facility','formation'
    )),
    outcome_date date NOT NULL,
    announcement_date date,
    country_code text,
    state_code text,
    county_fips text,
    city text,
    origin_country text,
    origin_state text,
    origin_county_fips text,
    origin_city text,
    destination_country text,
    destination_state text,
    destination_county_fips text,
    destination_city text,
    jobs_created integer,
    jobs_lost integer,
    capital_investment numeric(20,2),
    currency text,
    square_feet numeric,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    source_event_id uuid REFERENCES company_events(id) ON DELETE SET NULL,
    registration_id uuid REFERENCES business_registrations(id) ON DELETE SET NULL,
    verification_status text NOT NULL CHECK (verification_status IN ('source_verified','corroborated','approved')),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_observed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (company_id IS NOT NULL OR outcome_type='formation'),
    CHECK (outcome_type<>'relocation' OR (
        (origin_country IS NOT NULL OR origin_state IS NOT NULL OR origin_county_fips IS NOT NULL OR origin_city IS NOT NULL)
        AND (destination_country IS NOT NULL OR destination_state IS NOT NULL OR destination_county_fips IS NOT NULL OR destination_city IS NOT NULL)
    )),
    CHECK (capital_investment IS NULL OR currency IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS company_outcomes_company_date_idx ON company_outcomes (company_id,outcome_date DESC);
CREATE INDEX IF NOT EXISTS company_outcomes_type_date_idx ON company_outcomes (outcome_type,outcome_date DESC);
CREATE INDEX IF NOT EXISTS company_outcomes_geography_idx
    ON company_outcomes (country_code,state_code,county_fips,outcome_date DESC);

-- Point-in-time normalized interfaces. An absent feed remains a coverage fact,
-- never a row manufactured to satisfy a feature.
CREATE TABLE IF NOT EXISTS hiring_signal_observations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    observation_fingerprint text NOT NULL UNIQUE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    observed_date date NOT NULL,
    observed_at timestamptz NOT NULL,
    posting_count integer,
    new_postings integer,
    closed_postings integer,
    occupation_code text,
    occupation_label text,
    city text,
    county_fips text,
    state_code text,
    country_code text,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hiring_signals_company_date_idx
    ON hiring_signal_observations (company_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS company_property_signals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_fingerprint text NOT NULL UNIQUE,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    signal_type text NOT NULL CHECK (signal_type IN (
        'lease','facility_acquisition','sale','permit','development_application','zoning'
    )),
    relationship_type text NOT NULL CHECK (relationship_type IN (
        'owner','tenant','occupant','developer','permit_applicant','contractor','landlord','unknown'
    )),
    relationship_verified boolean NOT NULL DEFAULT false,
    event_date date,
    observed_at timestamptz NOT NULL,
    address_line text,
    city text,
    county_fips text,
    state_code text,
    country_code text,
    square_feet numeric,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_signals_company_date_idx
    ON company_property_signals (company_id,observed_at DESC) WHERE company_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS company_funding_signals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_fingerprint text NOT NULL UNIQUE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    funding_type text NOT NULL CHECK (funding_type IN (
        'sec_financing','sbir','sttr','nih_grant','state_incentive','other_official'
    )),
    funding_date date,
    observed_at timestamptz NOT NULL,
    amount numeric(20,2),
    currency text,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (amount IS NULL OR currency IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS funding_signals_company_date_idx
    ON company_funding_signals (company_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS formation_activity_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_fingerprint text NOT NULL UNIQUE,
    as_of_month date NOT NULL CHECK (date_trunc('month',as_of_month)::date=as_of_month),
    country_code text NOT NULL,
    state_code text,
    county_fips text,
    industry_code text NOT NULL,
    industry_label text,
    new_registrations integer,
    active_registrations integer,
    closures_dissolutions integer,
    commercial_permits integer,
    new_construction_permits integer,
    tenant_improvement_permits integer,
    job_posting_volume integer,
    sbir_sttr_awards integer,
    nih_grants integer,
    federal_awards integer,
    state_incentives integer,
    employment numeric,
    average_wage numeric,
    establishment_count integer,
    formation_score numeric(6,3) CHECK (formation_score IS NULL OR formation_score BETWEEN 0 AND 100),
    activity_level text CHECK (activity_level IS NULL OR activity_level IN ('low','moderate','high')),
    data_sufficiency text NOT NULL CHECK (data_sufficiency IN ('sufficient','limited','insufficient_history')),
    model_version text NOT NULL,
    components jsonb NOT NULL DEFAULT '{}'::jsonb,
    coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
    generated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (as_of_month,country_code,state_code,county_fips,industry_code,model_version)
);
CREATE INDEX IF NOT EXISTS formation_snapshots_geography_idx
    ON formation_activity_snapshots (country_code,state_code,county_fips,industry_code,as_of_month DESC);

CREATE TABLE IF NOT EXISTS company_change_feature_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_fingerprint text NOT NULL UNIQUE,
    model_type text NOT NULL CHECK (model_type IN (
        'company_expansion','company_relocation','company_growth','company_contraction','business_formation'
    )),
    as_of_date date NOT NULL,
    company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
    country_code text,
    state_code text,
    county_fips text,
    industry_code text,
    feature_values jsonb NOT NULL,
    feature_observation_cutoff timestamptz NOT NULL,
    source_observation_times jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (model_type='business_formation' AND company_id IS NULL AND country_code IS NOT NULL AND industry_code IS NOT NULL)
        OR (model_type<>'business_formation' AND company_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS change_features_company_date_idx
    ON company_change_feature_snapshots (company_id,model_type,as_of_date DESC) WHERE company_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS company_change_predictions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_fingerprint text NOT NULL UNIQUE,
    model_id uuid NOT NULL REFERENCES prediction_models(id),
    prediction_type text NOT NULL CHECK (prediction_type IN (
        'company_expansion','company_relocation','company_growth','company_contraction','business_formation'
    )),
    as_of_date date NOT NULL,
    horizon_days integer,
    horizon_months integer,
    company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
    country_code text,
    state_code text,
    county_fips text,
    industry_code text,
    probability numeric(7,6) CHECK (probability IS NULL OR probability BETWEEN 0 AND 1),
    likelihood_band text CHECK (likelihood_band IS NULL OR likelihood_band IN ('low','medium','high')),
    data_sufficiency text NOT NULL CHECK (data_sufficiency IN ('sufficient','insufficient_history','failed_calibration')),
    reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
    feature_snapshot jsonb NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (prediction_type='business_formation' AND company_id IS NULL AND country_code IS NOT NULL AND industry_code IS NOT NULL AND horizon_months IN (3,6,12) AND horizon_days IS NULL)
        OR (prediction_type<>'business_formation' AND company_id IS NOT NULL AND horizon_days IN (90,180,365) AND horizon_months IS NULL)
    ),
    CHECK ((data_sufficiency='sufficient' AND probability IS NOT NULL) OR (data_sufficiency<>'sufficient' AND probability IS NULL))
);
CREATE INDEX IF NOT EXISTS change_predictions_company_date_idx
    ON company_change_predictions (company_id,prediction_type,as_of_date DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS formation_predictions_geography_idx
    ON company_change_predictions (country_code,state_code,county_fips,industry_code,as_of_date DESC)
    WHERE prediction_type='business_formation';

CREATE TABLE IF NOT EXISTS signal_source_coverage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_family text NOT NULL CHECK (signal_family IN (
        'procurement','workforce','facilities_property','corporate','government_economic_development','geography_market','business_registration'
    )),
    source_system text,
    country_code text,
    state_code text,
    county_fips text,
    implementation_status text NOT NULL CHECK (implementation_status IN (
        'implemented','available','unsupported','licensing_blocked','insufficient_coverage'
    )),
    official_url text,
    known_limitations text NOT NULL,
    reuse_status text NOT NULL DEFAULT 'unverified' CHECK (reuse_status IN ('permitted','restricted','unverified','not_applicable')),
    coverage_start date,
    coverage_end date,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS signal_source_coverage_unique_idx ON signal_source_coverage (
    signal_family,COALESCE(source_system,''),country_code,COALESCE(state_code,''),COALESCE(county_fips,'')
);

INSERT INTO signal_source_coverage (
    signal_family,source_system,country_code,state_code,implementation_status,official_url,known_limitations,reuse_status,metadata
) VALUES
('procurement','usaspending','US',NULL,'implemented','https://api.usaspending.gov/','Federal procurement measures government-business activity; it does not prove physical expansion or contraction.','permitted','{"feature_scope":"nationwide federal awards and transactions"}'::jsonb),
('workforce','maryland_warn','US','MD','implemented','https://www.labor.maryland.gov/employment/warn.shtml','Workforce reductions only; no nationwide hiring-posting feed is configured.','unverified','{"hiring_feed":"unsupported"}'::jsonb),
('workforce','virginia_warn','US','VA','implemented','https://virginiaworks.gov/im-an-employer/retain-and-grow/warn-notices/','Workforce reductions only; no nationwide hiring-posting feed is configured.','unverified','{"hiring_feed":"unsupported"}'::jsonb),
('workforce',NULL,'US',NULL,'unsupported',NULL,'No commercially permissible nationwide job-posting feed is configured.','not_applicable','{}'::jsonb),
('facilities_property','montgomery_county_commercial_permits','US','MD','insufficient_coverage','https://data.montgomerycountymd.gov/d/i26v-w6bd','Commercial permits cover one Maryland county; a permit-party relationship does not prove occupancy.','permitted','{"county_fips":"24031"}'::jsonb),
('corporate','sec_edgar_submissions','US',NULL,'implemented','https://data.sec.gov/submissions/','Only companies with a verified SEC CIK are monitored; filing observations do not independently prove expansion.','permitted','{}'::jsonb),
('government_economic_development','maryland_commerce_press','US','MD','implemented','https://commerce.maryland.gov/press-room','Official Maryland announcements only; nationwide state coverage is not yet implemented.','unverified','{}'::jsonb),
('business_registration',NULL,'US',NULL,'unsupported',NULL,'No official state registration adapter with verified current access and commercial reuse is configured.','not_applicable','{"adapter_interface":"implemented","records_available":false}'::jsonb),
('geography_market',NULL,'US',NULL,'unsupported',NULL,'Employment, wages, establishment, vacancy, and cost context feeds are not yet configured.','not_applicable','{}'::jsonb)
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS business_registrations_set_updated_at ON business_registrations;
CREATE TRIGGER business_registrations_set_updated_at BEFORE UPDATE ON business_registrations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
