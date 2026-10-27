-- Location-first business change intelligence. This migration is additive and
-- does not reinterpret or rewrite procurement, movement, or v1/v2 assessment history.

ALTER TABLE business_registrations ADD COLUMN IF NOT EXISTS trade_name text;

ALTER TABLE prediction_models DROP CONSTRAINT IF EXISTS prediction_models_model_type_check;
ALTER TABLE prediction_models ADD CONSTRAINT prediction_models_model_type_check CHECK (model_type IN (
    'new_award','contract_change','renewal_recompete','company_expansion','company_relocation',
    'company_growth','company_contraction','business_formation','establishment_opening','establishment_closure'
));

ALTER TABLE company_discoveries DROP CONSTRAINT IF EXISTS company_discoveries_discovery_reason_check;
ALTER TABLE company_discoveries ADD CONSTRAINT company_discoveries_discovery_reason_check CHECK (discovery_reason IN (
    'new_award','contract_change','movement_signal','permit_signal','sec_signal','saved_search_match',
    'expansion_indication','relocation_indication','growth_indication','contraction_indication',
    'early_growth_indication','new_business','potential_opening','opening_indication','closure_signal',
    'closing_indication','relocation_signal','contraction_signal','other'
));

ALTER TABLE alert_events DROP CONSTRAINT IF EXISTS alert_events_alert_type_check;
ALTER TABLE alert_events ADD CONSTRAINT alert_events_alert_type_check CHECK (alert_type IN (
    'new_award','contract_modified','procurement_event','movement_event','permit_event','sec_filing',
    'saved_search_match','region_event','indication_strengthened','formation_surge',
    'confirmed_expansion','confirmed_relocation','confirmed_closure','new_business_formed',
    'opening_detected','relocation_indication','closure_announced','business_dissolved'
));

INSERT INTO prediction_models (
    model_type,version,algorithm,observation_start,training_end,validation_end,test_end,horizons,
    feature_names,coefficients,intercept,sample_counts,metrics,probability_eligible,status,data_provenance,notes
) VALUES
('establishment_opening','business-change-probability-unavailable-v1','not_trained',NULL,'2026-10-27',NULL,NULL,ARRAY[90,180,365],'[]'::jsonb,'{}'::jsonb,0,'{"historical_observations":0,"positive_outcomes":0}'::jsonb,'{}'::jsonb,false,'insufficient_history','{"outcome_ledger":"business_change_outcomes","point_in_time_required":true}'::jsonb,'Disabled until independently validated establishment-opening outcomes exist.'),
('establishment_closure','business-change-probability-unavailable-v1','not_trained',NULL,'2026-10-27',NULL,NULL,ARRAY[90,180,365],'[]'::jsonb,'{}'::jsonb,0,'{"historical_observations":0,"positive_outcomes":0}'::jsonb,'{}'::jsonb,false,'insufficient_history','{"outcome_ledger":"business_change_outcomes","point_in_time_required":true}'::jsonb,'Disabled until independently validated establishment-closure outcomes exist.'),
('company_growth','business-change-probability-unavailable-v1','not_trained',NULL,'2026-10-27',NULL,NULL,ARRAY[90,180,365],'[]'::jsonb,'{}'::jsonb,0,'{"historical_observations":0,"positive_outcomes":0}'::jsonb,'{}'::jsonb,false,'insufficient_history','{"outcome_ledger":"business_change_outcomes","point_in_time_required":true}'::jsonb,'Disabled until independently validated growth outcomes exist.'),
('company_contraction','business-change-probability-unavailable-v1','not_trained',NULL,'2026-10-27',NULL,NULL,ARRAY[90,180,365],'[]'::jsonb,'{}'::jsonb,0,'{"historical_observations":0,"positive_outcomes":0}'::jsonb,'{}'::jsonb,false,'insufficient_history','{"outcome_ledger":"business_change_outcomes","point_in_time_required":true}'::jsonb,'Disabled until independently validated contraction outcomes exist.'),
('company_relocation','business-change-probability-unavailable-v1','not_trained',NULL,'2026-10-27',NULL,NULL,ARRAY[90,180,365],'[]'::jsonb,'{}'::jsonb,0,'{"historical_observations":0,"positive_outcomes":0}'::jsonb,'{}'::jsonb,false,'insufficient_history','{"outcome_ledger":"business_change_outcomes","point_in_time_required":true}'::jsonb,'Disabled until independently validated relocation outcomes exist.'),
('business_formation','business-change-probability-unavailable-v1','not_trained',NULL,'2026-10-27',NULL,NULL,ARRAY[3,6,12],'[]'::jsonb,'{}'::jsonb,0,'{"historical_observations":0,"positive_outcomes":0}'::jsonb,'{}'::jsonb,false,'insufficient_history','{"unit":"geography_industry_period","outcome_ledger":"business_change_outcomes","point_in_time_required":true}'::jsonb,'Disabled until geography-industry-period formation outcomes pass chronological validation.')
ON CONFLICT (model_type,version) DO NOTHING;

INSERT INTO data_sources (
    source_system,name,country_code,source_market,official_url,license_name,update_frequency,quality_status,metadata
) VALUES (
    'dc_basic_business_licenses',
    'DC Basic Business License — Last 30 Days',
    'US','US_DC_BUSINESS_LICENSE',
    'https://opendata.dc.gov/datasets/a9ac9f8d9d1546e8bd6610b48cb29810',
    'Creative Commons Attribution 4.0 International','daily','unknown',
    '{"publisher":"District of Columbia Department of Licensing and Consumer Protection","arcgis_item_id":"a9ac9f8d9d1546e8bd6610b48cb29810","arcgis_layer_url":"https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/1","commercial_use_status":"permitted_with_attribution","scope":"licenses issued in the last 30 days, including historical records that may now be inactive","privacy":"owner, agent, and billing fields are deliberately not collected"}'::jsonb
) ON CONFLICT (source_system) DO UPDATE SET
    name=EXCLUDED.name,official_url=EXCLUDED.official_url,license_name=EXCLUDED.license_name,
    update_frequency=EXCLUDED.update_frequency,metadata=data_sources.metadata || EXCLUDED.metadata,updated_at=now();

CREATE TABLE IF NOT EXISTS business_establishments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_fingerprint text NOT NULL UNIQUE,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    establishment_name text NOT NULL,
    establishment_type text,
    address_line text,
    city text,
    county text,
    county_fips text,
    state_code text,
    postal_code text,
    country_code text NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    location_precision text NOT NULL CHECK (location_precision IN (
        'exact_address','postal_code','city','county','state','unknown'
    )),
    is_public_business_location boolean NOT NULL DEFAULT false,
    location_status text NOT NULL DEFAULT 'unknown' CHECK (location_status IN (
        'planned','opening','active','expanding','contracting','relocating','closing','closed','unknown'
    )),
    opened_date date,
    closed_date date,
    verified_headquarters boolean NOT NULL DEFAULT false,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    verification_status text NOT NULL CHECK (verification_status IN (
        'source_verified','corroborated','review_required','rejected'
    )),
    match_status text NOT NULL DEFAULT 'unresolved' CHECK (match_status IN (
        'unresolved','candidate','auto_verified','approved','rejected'
    )),
    confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_observed_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (closed_date IS NULL OR opened_date IS NULL OR closed_date>=opened_date),
    CHECK (is_public_business_location OR address_line IS NULL),
    CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
CREATE INDEX IF NOT EXISTS business_establishments_company_idx
    ON business_establishments (company_id,location_status) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_establishments_geography_idx
    ON business_establishments (country_code,state_code,county_fips,city,postal_code,location_status);
CREATE INDEX IF NOT EXISTS business_establishments_status_idx
    ON business_establishments (location_status,last_observed_at DESC);

CREATE TABLE IF NOT EXISTS establishment_address_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    address_fingerprint text NOT NULL UNIQUE,
    establishment_id uuid NOT NULL REFERENCES business_establishments(id) ON DELETE CASCADE,
    address_line text,
    city text,
    county text,
    county_fips text,
    state_code text,
    postal_code text,
    country_code text NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    location_precision text NOT NULL CHECK (location_precision IN (
        'exact_address','postal_code','city','county','state','unknown'
    )),
    is_public_business_location boolean NOT NULL DEFAULT false,
    valid_from date,
    valid_to date,
    first_observed_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to>=valid_from),
    CHECK (is_public_business_location OR address_line IS NULL)
);
CREATE INDEX IF NOT EXISTS establishment_address_history_establishment_idx
    ON establishment_address_history (establishment_id,valid_from DESC,last_observed_at DESC);

CREATE TABLE IF NOT EXISTS business_licenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    license_fingerprint text NOT NULL UNIQUE,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_license_id text NOT NULL,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    establishment_id uuid REFERENCES business_establishments(id) ON DELETE SET NULL,
    legal_name text NOT NULL,
    trade_name text,
    entity_type text,
    license_type text,
    business_activity text,
    category text,
    license_status text,
    status_date date,
    initial_issue_date date,
    start_date date,
    end_date date,
    premise_address text,
    city text,
    county text,
    county_fips text,
    state_code text,
    postal_code text,
    country_code text NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    location_precision text NOT NULL CHECK (location_precision IN (
        'exact_address','postal_code','city','county','state','unknown'
    )),
    premise_is_public_business_location boolean NOT NULL DEFAULT false,
    source_url text NOT NULL,
    observed_at timestamptz NOT NULL,
    first_observed_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    resolution_status text NOT NULL DEFAULT 'unresolved' CHECK (resolution_status IN (
        'unresolved','candidate','auto_verified','approved','rejected'
    )),
    resolution_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,source_license_id),
    CHECK (premise_is_public_business_location OR premise_address IS NULL)
);
CREATE INDEX IF NOT EXISTS business_licenses_issue_idx
    ON business_licenses (country_code,state_code,county_fips,initial_issue_date DESC);
CREATE INDEX IF NOT EXISTS business_licenses_resolution_idx
    ON business_licenses (resolution_status,observed_at DESC);

CREATE TABLE IF NOT EXISTS business_license_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_license_id uuid NOT NULL REFERENCES business_licenses(id) ON DELETE CASCADE,
    source_record_fingerprint text NOT NULL UNIQUE,
    content_hash text NOT NULL,
    source_url text NOT NULL,
    collected_at timestamptz NOT NULL,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (business_license_id,content_hash)
);
CREATE INDEX IF NOT EXISTS business_license_versions_license_idx
    ON business_license_versions (business_license_id,collected_at DESC);

CREATE TABLE IF NOT EXISTS establishment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_fingerprint text NOT NULL UNIQUE,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    establishment_id uuid REFERENCES business_establishments(id) ON DELETE SET NULL,
    observed_business_name text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN (
        'business_formed','location_planned','location_opening','location_opened','location_expansion',
        'workforce_expansion','company_growth','relocation_planned','relocation_completed',
        'workforce_contraction','location_contraction','closure_announced','location_closed',
        'business_dissolved','market_entry','facility_acquisition','facility_disposition'
    )),
    event_status text NOT NULL CHECK (event_status IN (
        'suspected','indicated','announced','approved','underway','opened','completed','cancelled','closed'
    )),
    announced_date date,
    effective_date date,
    jobs_created integer,
    jobs_lost integer,
    jobs_affected integer,
    square_feet numeric,
    capital_investment numeric(20,2),
    currency text,
    origin_establishment_id uuid REFERENCES business_establishments(id) ON DELETE SET NULL,
    destination_establishment_id uuid REFERENCES business_establishments(id) ON DELETE SET NULL,
    origin_country text,
    origin_state text,
    origin_county_fips text,
    origin_city text,
    origin_postal_code text,
    destination_country text,
    destination_state text,
    destination_county_fips text,
    destination_city text,
    destination_postal_code text,
    location_precision text NOT NULL CHECK (location_precision IN (
        'exact_address','postal_code','city','county','state','unknown'
    )),
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    verification_status text NOT NULL CHECK (verification_status IN (
        'source_verified','corroborated','review_required','rejected'
    )),
    match_status text NOT NULL CHECK (match_status IN (
        'unresolved','candidate','auto_verified','approved','rejected'
    )),
    confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_observed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (capital_investment IS NULL OR currency IS NOT NULL),
    CHECK (event_type NOT IN ('relocation_completed') OR (
        (origin_establishment_id IS NOT NULL OR origin_country IS NOT NULL OR origin_state IS NOT NULL OR origin_county_fips IS NOT NULL OR origin_city IS NOT NULL)
        AND (destination_establishment_id IS NOT NULL OR destination_country IS NOT NULL OR destination_state IS NOT NULL OR destination_county_fips IS NOT NULL OR destination_city IS NOT NULL)
    ))
);
CREATE INDEX IF NOT EXISTS establishment_events_type_date_idx
    ON establishment_events (event_type,COALESCE(effective_date,announced_date) DESC);
CREATE INDEX IF NOT EXISTS establishment_events_company_idx
    ON establishment_events (company_id,COALESCE(effective_date,announced_date) DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS establishment_events_establishment_idx
    ON establishment_events (establishment_id,COALESCE(effective_date,announced_date) DESC) WHERE establishment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS establishment_events_destination_idx
    ON establishment_events (destination_country,destination_state,destination_county_fips,destination_city,COALESCE(effective_date,announced_date) DESC);
CREATE INDEX IF NOT EXISTS establishment_events_origin_idx
    ON establishment_events (origin_country,origin_state,origin_county_fips,origin_city,COALESCE(effective_date,announced_date) DESC);

CREATE TABLE IF NOT EXISTS establishment_event_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_fingerprint text NOT NULL UNIQUE,
    establishment_event_id uuid REFERENCES establishment_events(id) ON DELETE SET NULL,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_record_id text NOT NULL,
    source_url text NOT NULL,
    source_type text NOT NULL,
    content_hash text NOT NULL,
    collected_at timestamptz NOT NULL,
    evidence_excerpt text,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,source_record_id,content_hash)
);
CREATE INDEX IF NOT EXISTS establishment_event_evidence_event_idx
    ON establishment_event_evidence (establishment_event_id,collected_at DESC);

CREATE TABLE IF NOT EXISTS business_change_evidence_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_fingerprint text NOT NULL UNIQUE,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    establishment_id uuid REFERENCES business_establishments(id) ON DELETE SET NULL,
    change_type text NOT NULL,
    country_code text,
    state_code text,
    county_fips text,
    city text,
    earliest_observed_at timestamptz NOT NULL,
    latest_observed_at timestamptz NOT NULL,
    grouping_method text NOT NULL,
    grouping_confidence numeric(4,3) NOT NULL CHECK (grouping_confidence BETWEEN 0 AND 1),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_change_signals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_fingerprint text NOT NULL UNIQUE,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    establishment_id uuid REFERENCES business_establishments(id) ON DELETE SET NULL,
    evidence_group_id uuid REFERENCES business_change_evidence_groups(id) ON DELETE SET NULL,
    signal_family text NOT NULL CHECK (signal_family IN (
        'registration','licenses','facilities_permits','workforce','property','corporate_capital',
        'economic_development','government_business','geography_market'
    )),
    signal_type text NOT NULL,
    direction text NOT NULL CHECK (direction IN ('positive','negative','neutral')),
    observed_at timestamptz NOT NULL,
    effective_date date,
    country_code text,
    state_code text,
    county_fips text,
    city text,
    postal_code text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    location_precision text NOT NULL CHECK (location_precision IN (
        'exact_address','postal_code','city','county','state','unknown'
    )),
    strength numeric(4,3) NOT NULL CHECK (strength BETWEEN 0 AND 1),
    reliability numeric(4,3) NOT NULL CHECK (reliability BETWEEN 0 AND 1),
    confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    source_event_type text,
    source_event_id text,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_change_signals_geography_idx
    ON business_change_signals (country_code,state_code,county_fips,city,postal_code,observed_at DESC);
CREATE INDEX IF NOT EXISTS business_change_signals_company_idx
    ON business_change_signals (company_id,observed_at DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_change_signals_establishment_idx
    ON business_change_signals (establishment_id,observed_at DESC) WHERE establishment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_change_signals_family_idx
    ON business_change_signals (signal_family,signal_type,observed_at DESC);

CREATE TABLE IF NOT EXISTS business_change_outcome_definitions (
    definition_version text PRIMARY KEY,
    outcome_type text NOT NULL,
    positive_definition text NOT NULL,
    exclusions text NOT NULL,
    requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
    effective_from date NOT NULL,
    retired_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO business_change_outcome_definitions (
    definition_version,outcome_type,positive_definition,exclusions,requirements,effective_from
) VALUES
('business-formed-v1','business_formed','Official registration establishes a new legal business.','Does not establish that a physical location opened.','{"requires_official_registration":true}'::jsonb,'2026-01-01'),
('establishment-opened-v1','establishment_opened','Source-backed evidence establishes that a business establishment opened at a public operating location.','Registration, permit, contract, or license alone does not prove opening.','{"requires_operating_location":true,"requires_source_url":true}'::jsonb,'2026-01-01'),
('establishment-expanded-v1','establishment_expanded','Source-backed physical or material workforce expansion at an establishment.','A company-wide contract award alone does not qualify.','{"requires_establishment_or_specific_geography":true}'::jsonb,'2026-01-01'),
('establishment-relocated-v1','establishment_relocated','Source-backed move from an origin establishment/geography to a destination establishment/geography.','A new second location is not relocation.','{"requires_origin":true,"requires_destination":true}'::jsonb,'2026-01-01'),
('establishment-contracted-v1','establishment_contracted','Source-backed workforce or physical contraction at a particular establishment.','A deobligation alone does not qualify.','{"requires_establishment_or_specific_geography":true}'::jsonb,'2026-01-01'),
('establishment-closed-v1','establishment_closed','Source-backed closure of a particular operating establishment.','A WARN or bankruptcy without a site closure does not mean the whole company closed.','{"requires_location_closure":true}'::jsonb,'2026-01-01'),
('business-dissolved-v1','business_dissolved','Official registration source establishes dissolution or termination of the legal entity.','License expiration or location closure alone is not business dissolution.','{"requires_official_registration_status":true}'::jsonb,'2026-01-01')
ON CONFLICT (definition_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS business_change_outcomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outcome_fingerprint text NOT NULL UNIQUE,
    definition_version text NOT NULL REFERENCES business_change_outcome_definitions(definition_version),
    outcome_type text NOT NULL CHECK (outcome_type IN (
        'business_formed','establishment_opened','establishment_expanded','establishment_relocated',
        'establishment_contracted','establishment_closed','business_dissolved'
    )),
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    establishment_id uuid REFERENCES business_establishments(id) ON DELETE SET NULL,
    establishment_event_id uuid REFERENCES establishment_events(id) ON DELETE SET NULL,
    business_registration_id uuid REFERENCES business_registrations(id) ON DELETE SET NULL,
    outcome_date date NOT NULL,
    announcement_date date,
    country_code text,
    state_code text,
    county_fips text,
    city text,
    postal_code text,
    origin_establishment_id uuid REFERENCES business_establishments(id) ON DELETE SET NULL,
    destination_establishment_id uuid REFERENCES business_establishments(id) ON DELETE SET NULL,
    origin_country text,
    origin_state text,
    origin_county_fips text,
    origin_city text,
    destination_country text,
    destination_state text,
    destination_county_fips text,
    destination_city text,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    verification_status text NOT NULL CHECK (verification_status IN ('source_verified','corroborated','approved')),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_indication_at timestamptz,
    first_observed_at timestamptz NOT NULL,
    lead_time_days integer CHECK (lead_time_days IS NULL OR lead_time_days>=0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (outcome_type NOT IN ('establishment_relocated') OR (
        (origin_establishment_id IS NOT NULL OR origin_country IS NOT NULL OR origin_state IS NOT NULL OR origin_county_fips IS NOT NULL OR origin_city IS NOT NULL)
        AND (destination_establishment_id IS NOT NULL OR destination_country IS NOT NULL OR destination_state IS NOT NULL OR destination_county_fips IS NOT NULL OR destination_city IS NOT NULL)
    ))
);
CREATE INDEX IF NOT EXISTS business_change_outcomes_type_date_idx
    ON business_change_outcomes (outcome_type,outcome_date DESC);
CREATE INDEX IF NOT EXISTS business_change_outcomes_geography_idx
    ON business_change_outcomes (country_code,state_code,county_fips,city,postal_code,outcome_date DESC);
CREATE INDEX IF NOT EXISTS business_change_outcomes_company_idx
    ON business_change_outcomes (company_id,outcome_date DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_change_outcomes_establishment_idx
    ON business_change_outcomes (establishment_id,outcome_date DESC) WHERE establishment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS business_change_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_fingerprint text NOT NULL UNIQUE,
    unit_type text NOT NULL CHECK (unit_type IN ('company','establishment','location')),
    company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
    establishment_id uuid REFERENCES business_establishments(id) ON DELETE CASCADE,
    country_code text,
    state_code text,
    county_fips text,
    city text,
    postal_code text,
    assessment_type text NOT NULL CHECK (assessment_type IN (
        'opening','growth','relocation','closing','contraction','formation_activity','growth_activity','closure_activity'
    )),
    as_of_date date NOT NULL,
    score numeric(6,3) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    band text NOT NULL CHECK (band IN ('strong','moderate','early','insufficient_evidence')),
    evidence_quality text NOT NULL CHECK (evidence_quality IN ('high','medium','low','insufficient')),
    data_sufficiency text NOT NULL CHECK (data_sufficiency IN ('sufficient','limited','insufficient_history')),
    model_version text NOT NULL,
    components jsonb NOT NULL DEFAULT '{}'::jsonb,
    explanation text NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (unit_type='company' AND company_id IS NOT NULL AND establishment_id IS NULL)
        OR (unit_type='establishment' AND establishment_id IS NOT NULL)
        OR (unit_type='location' AND company_id IS NULL AND establishment_id IS NULL AND country_code IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS business_change_assessments_company_idx
    ON business_change_assessments (company_id,assessment_type,as_of_date DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_change_assessments_establishment_idx
    ON business_change_assessments (establishment_id,assessment_type,as_of_date DESC) WHERE establishment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_change_assessments_geography_idx
    ON business_change_assessments (country_code,state_code,county_fips,city,postal_code,assessment_type,as_of_date DESC);

CREATE TABLE IF NOT EXISTS location_monitor_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    target_name text NOT NULL,
    geography_type text NOT NULL CHECK (geography_type IN ('state','county','city','postal_code')),
    country_code text NOT NULL,
    state_code text,
    county_fips text,
    city text,
    postal_code text,
    tracking_status text NOT NULL DEFAULT 'active' CHECK (tracking_status IN ('active','paused','archived')),
    event_types text[] NOT NULL DEFAULT ARRAY['opening','growing','moving','closing','shrinking','new_businesses']::text[],
    added_at timestamptz NOT NULL DEFAULT now(),
    last_evaluated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (geography_type='state' AND state_code IS NOT NULL)
        OR (geography_type='county' AND county_fips IS NOT NULL)
        OR (geography_type='city' AND city IS NOT NULL AND state_code IS NOT NULL)
        OR (geography_type='postal_code' AND postal_code IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS location_monitor_targets_unique_idx ON location_monitor_targets (
    COALESCE(user_id,'00000000-0000-0000-0000-000000000000'::uuid),country_code,
    COALESCE(state_code,''),COALESCE(county_fips,''),COALESCE(city,''),COALESCE(postal_code,'')
);

CREATE TABLE IF NOT EXISTS business_change_source_coverage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_family text NOT NULL,
    source_system text,
    source_name text NOT NULL,
    country_code text NOT NULL,
    state_code text,
    county_fips text,
    coverage_status text NOT NULL CHECK (coverage_status IN ('available','partial','unsupported','planned')),
    reuse_status text NOT NULL CHECK (reuse_status IN ('permitted','permitted_with_attribution','restricted','unverified','not_applicable')),
    update_frequency text,
    official_url text,
    limitations text NOT NULL,
    fields_available jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS business_change_source_coverage_unique_idx ON business_change_source_coverage (
    signal_family,COALESCE(source_system,''),country_code,COALESCE(state_code,''),COALESCE(county_fips,'')
);

INSERT INTO business_change_source_coverage (
    signal_family,source_system,source_name,country_code,state_code,county_fips,coverage_status,reuse_status,
    update_frequency,official_url,limitations,fields_available,metadata
) VALUES
('government_business','usaspending','USAspending','US',NULL,NULL,'available','permitted','daily','https://api.usaspending.gov/','Government business activity is not proof of a physical opening, expansion, move, or closure.','["awards","modifications","obligations","agencies","performance_geography"]'::jsonb,'{}'::jsonb),
('government_business','uk_find_a_tender','UK Find a Tender','GB',NULL,NULL,'available','permitted','daily','https://www.find-tender.service.gov.uk/','Procurement coverage only.','["notices","awards","suppliers"]'::jsonb,'{}'::jsonb),
('government_business','eu_ted','EU Tenders Electronic Daily','EU',NULL,NULL,'available','permitted_with_attribution','daily','https://ted.europa.eu/','Procurement coverage only.','["notices","awards","suppliers"]'::jsonb,'{}'::jsonb),
('workforce','maryland_warn','Maryland WARN','US','MD',NULL,'partial','unverified','as published','https://www.labor.maryland.gov/employment/warn.shtml','Workforce reductions; not every notice establishes a full establishment closure.','["layoffs","closures","affected_site"]'::jsonb,'{}'::jsonb),
('workforce','virginia_warn','Virginia WARN','US','VA',NULL,'partial','unverified','as published','https://virginiaworks.gov/im-an-employer/retain-and-grow/warn-notices/','Workforce reductions only.','["layoffs","closures","affected_site"]'::jsonb,'{}'::jsonb),
('economic_development','maryland_commerce_press','Maryland Commerce Press Room','US','MD',NULL,'partial','unverified','as published','https://commerce.maryland.gov/press-room','Official Maryland announcements only.','["expansion","jobs","investment","facility"]'::jsonb,'{}'::jsonb),
('facilities_permits','montgomery_county_commercial_permits','Montgomery County Commercial Permits','US','MD','24031','partial','permitted_with_attribution','daily','https://data.montgomerycountymd.gov/d/i26v-w6bd','A permit party or address does not prove occupancy.','["permit_type","work_type","value","address"]'::jsonb,'{}'::jsonb),
('corporate_capital','sec_edgar_submissions','SEC EDGAR','US',NULL,NULL,'partial','permitted','real time','https://data.sec.gov/submissions/','Only verified-CIK companies; filing facts do not prove physical change.','["filing_type","filing_date","filing_url"]'::jsonb,'{}'::jsonb),
('licenses','dc_basic_business_licenses','DC Basic Business Licenses — Last 30 Days','US','DC',NULL,'available','permitted_with_attribution','daily','https://opendata.dc.gov/datasets/a9ac9f8d9d1546e8bd6610b48cb29810','Thirty-day issued-license window; a license is an opening signal, not proof that the establishment opened. Owner, agent, and billing fields are excluded.','["license_id","entity_name","trade_name","status","initial_issue_date","business_activity","premise_address","MAR_ID"]'::jsonb,'{"license":"CC BY 4.0"}'::jsonb),
('registration',NULL,'Maryland SDAT corporate file','US','MD',NULL,'unsupported','restricted',NULL,'https://dat.maryland.gov/Pages/Services.aspx','Official bulk corporate release is sold through a contractor; no current free machine-readable API and commercial redistribution terms were verified.','[]'::jsonb,'{}'::jsonb),
('registration',NULL,'Virginia SCC Clerk Information System','US','VA',NULL,'unsupported','unverified',NULL,'https://www.scc.virginia.gov/businesses/business-faqs/cis-faq/','Searchable public system found, but no verified bulk API/feed or commercial reuse terms. Do not scrape.','[]'::jsonb,'{}'::jsonb),
('registration',NULL,'DC Corporate Registration','US','DC',NULL,'planned','permitted_with_attribution','as needed','https://opendata.dc.gov/','Official ArcGIS dataset exists; privacy and change-history validation remain before ingestion.','["entity_name","file_number","status"]'::jsonb,'{"arcgis_item_id":"5238c4fd99c843a1bd7679a243747a8c"}'::jsonb),
('registration','census_bfs','Census Business Formation Statistics','US',NULL,NULL,'planned','permitted','monthly / annual county','https://www.census.gov/econ/bfs/data.html','Aggregate benchmarking only; does not identify named businesses.','["applications","high_propensity_applications","formation_series"]'::jsonb,'{}'::jsonb),
('geography_market','census_bds','Census Business Dynamics Statistics','US',NULL,NULL,'planned','permitted','annual','https://api.census.gov/data/timeseries/bds.html','Aggregate establishment births, deaths, expansions, contractions, and jobs; not named real-time businesses.','["establishment_births","establishment_deaths","job_creation","job_destruction"]'::jsonb,'{}'::jsonb),
('geography_market','bls_bed','BLS Business Employment Dynamics','US',NULL,NULL,'planned','permitted','quarterly / annual','https://www.bls.gov/bdm/','Aggregate job gains and losses from opening, expanding, closing, and contracting establishments; does not identify named businesses.','["gross_job_gains","gross_job_losses","establishment_openings","establishment_closings","births","deaths"]'::jsonb,'{}'::jsonb),
('workforce',NULL,'Nationwide hiring feed','US',NULL,NULL,'unsupported','not_applicable',NULL,NULL,'No commercially permissible nationwide job-posting feed is configured.','[]'::jsonb,'{}'::jsonb),
('property',NULL,'Nationwide property / lease feed','US',NULL,NULL,'unsupported','not_applicable',NULL,NULL,'No nationwide source with verified access and reuse is configured.','[]'::jsonb,'{}'::jsonb)
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS business_establishments_set_updated_at ON business_establishments;
CREATE TRIGGER business_establishments_set_updated_at BEFORE UPDATE ON business_establishments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS business_licenses_set_updated_at ON business_licenses;
CREATE TRIGGER business_licenses_set_updated_at BEFORE UPDATE ON business_licenses
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS location_monitor_targets_set_updated_at ON location_monitor_targets;
CREATE TRIGGER location_monitor_targets_set_updated_at BEFORE UPDATE ON location_monitor_targets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
