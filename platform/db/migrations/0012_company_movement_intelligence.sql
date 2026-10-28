-- Company movement intelligence is deliberately separate from procurement_events.
-- A WARN worksite, recipient address, and independently verified headquarters are
-- different facts and must never be promoted into one another implicitly.

CREATE TABLE IF NOT EXISTS company_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_fingerprint text NOT NULL UNIQUE,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_country text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN (
        'layoff','closure','furlough','expansion','relocation','headquarters_move',
        'new_facility','facility_expansion','hiring','investment','permit','lease',
        'executive_change','regulatory_disclosure','funding','market_entry','bankruptcy',
        'restructuring','consolidation','opening','other'
    )),
    event_subtype text,
    event_status text NOT NULL DEFAULT 'announced' CHECK (event_status IN (
        'rumored','inferred','proposed','announced','planned','filed','approved','underway',
        'active','completed','rescinded','cancelled','unverified','unknown'
    )),
    verification_status text NOT NULL DEFAULT 'review_required' CHECK (verification_status IN (
        'source_verified','corroborated','review_required','rejected'
    )),
    announced_date date,
    event_date date,
    effective_start_date date,
    effective_end_date date,
    title text NOT NULL,
    summary text,
    employment_change integer,
    jobs_created integer,
    jobs_affected integer,
    capital_investment numeric(20,2),
    currency text,
    primary_state text,
    primary_county text,
    primary_county_fips text,
    primary_city text,
    primary_postal_code text,
    confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_observed_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (effective_end_date IS NULL OR effective_start_date IS NULL OR effective_end_date >= effective_start_date),
    CHECK (capital_investment IS NULL OR currency IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS company_events_date_idx
    ON company_events (COALESCE(effective_start_date,announced_date) DESC);
CREATE INDEX IF NOT EXISTS company_events_type_date_idx
    ON company_events (event_type,COALESCE(effective_start_date,announced_date) DESC);
CREATE INDEX IF NOT EXISTS company_events_geography_idx
    ON company_events (source_country,primary_state,primary_county_fips,primary_city);
CREATE INDEX IF NOT EXISTS company_events_source_idx
    ON company_events (source_system,last_observed_at DESC);
CREATE INDEX IF NOT EXISTS company_events_text_idx ON company_events USING gin
    (to_tsvector('english',coalesce(title,'') || ' ' || coalesce(summary,'')));

-- Every collected document revision is retained by content hash. event_id may be
-- null while entity matching is unresolved; the evidence is still preserved.
CREATE TABLE IF NOT EXISTS company_event_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid REFERENCES company_events(id) ON DELETE SET NULL,
    source_record_fingerprint text NOT NULL UNIQUE,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    document_identifier text NOT NULL,
    content_hash text NOT NULL,
    original_url text NOT NULL,
    publisher text NOT NULL,
    publication_date date,
    collected_at timestamptz NOT NULL,
    source_type text NOT NULL,
    record_status text NOT NULL DEFAULT 'parsed' CHECK (record_status IN (
        'parsed','linked','unmatched','ambiguous','rejected'
    )),
    is_primary boolean NOT NULL DEFAULT true,
    evidence_excerpt text,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    license_name text,
    commercial_use_status text NOT NULL DEFAULT 'unverified' CHECK (commercial_use_status IN (
        'permitted','restricted','unverified'
    )),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,document_identifier,content_hash)
);
CREATE INDEX IF NOT EXISTS company_event_sources_event_idx ON company_event_sources (event_id,collected_at DESC);
CREATE INDEX IF NOT EXISTS company_event_sources_unresolved_idx
    ON company_event_sources (record_status,collected_at DESC) WHERE record_status IN ('unmatched','ambiguous');

CREATE TABLE IF NOT EXISTS company_event_companies (
    event_id uuid NOT NULL REFERENCES company_events(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    observed_company_name text NOT NULL,
    relationship_type text NOT NULL DEFAULT 'subject' CHECK (relationship_type IN (
        'subject','owner','tenant','occupant','developer','permit_applicant','contractor','investor',
        'acquirer','seller','subsidiary','parent','affected_employer','employer','operator','other'
    )),
    is_primary boolean NOT NULL DEFAULT true,
    matching_method text NOT NULL,
    matching_confidence numeric(4,3) NOT NULL CHECK (matching_confidence >= 0 AND matching_confidence <= 1),
    matching_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN (
        'auto_verified','pending','approved','rejected'
    )),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id,company_id,relationship_type)
);
CREATE INDEX IF NOT EXISTS company_event_companies_company_idx
    ON company_event_companies (company_id,event_id);

-- Only independently sourced business locations belong here. Procurement
-- recipient addresses and event worksites remain in their own tables.
CREATE TABLE IF NOT EXISTS company_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_fingerprint text NOT NULL UNIQUE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    location_type text NOT NULL CHECK (location_type IN (
        'verified_headquarters','facility','office','registered_office','branch','other'
    )),
    address_line text,
    city text,
    county text,
    county_fips text,
    state_code text,
    postal_code text,
    country_code text NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_url text NOT NULL,
    verification_status text NOT NULL CHECK (verification_status IN (
        'source_verified','corroborated','review_required','rejected'
    )),
    confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    operational_status text NOT NULL DEFAULT 'unknown' CHECK (operational_status IN (
        'proposed','planned','active','inactive','closed','unknown'
    )),
    opening_date date,
    closure_date date,
    valid_from date,
    valid_to date,
    first_observed_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
    CHECK (closure_date IS NULL OR opening_date IS NULL OR closure_date >= opening_date)
);
CREATE INDEX IF NOT EXISTS company_locations_company_idx ON company_locations (company_id,location_type);
CREATE INDEX IF NOT EXISTS company_locations_geography_idx
    ON company_locations (country_code,state_code,county_fips,city);

CREATE TABLE IF NOT EXISTS company_event_locations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_fingerprint text NOT NULL UNIQUE,
    event_id uuid NOT NULL REFERENCES company_events(id) ON DELETE CASCADE,
    company_location_id uuid REFERENCES company_locations(id) ON DELETE SET NULL,
    location_role text NOT NULL CHECK (location_role IN (
        'affected_worksite','origin','destination','new_facility','expanded_facility',
        'headquarters','permit_site','leased_site','other'
    )),
    address_line text,
    city text,
    county text,
    county_fips text,
    state_code text,
    postal_code text,
    country_code text NOT NULL,
    is_primary boolean NOT NULL DEFAULT false,
    confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_event_locations_event_idx ON company_event_locations (event_id);
CREATE INDEX IF NOT EXISTS company_event_locations_geography_idx
    ON company_event_locations (country_code,state_code,county_fips,city);

CREATE TABLE IF NOT EXISTS company_match_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id uuid NOT NULL REFERENCES company_event_sources(id) ON DELETE CASCADE,
    observed_company_name text NOT NULL,
    candidate_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    match_status text NOT NULL CHECK (match_status IN ('unmatched','ambiguous','pending','approved','rejected')),
    matching_method text,
    confidence numeric(4,3) CHECK (confidence >= 0 AND confidence <= 1),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by text,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_id,candidate_company_id)
);
CREATE INDEX IF NOT EXISTS company_match_reviews_queue_idx
    ON company_match_reviews (match_status,created_at DESC) WHERE match_status IN ('unmatched','ambiguous');
CREATE UNIQUE INDEX IF NOT EXISTS company_match_reviews_unmatched_unique
    ON company_match_reviews (source_id) WHERE candidate_company_id IS NULL;

CREATE TABLE IF NOT EXISTS development_permits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    permit_fingerprint text NOT NULL UNIQUE,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_document_id text NOT NULL,
    permit_number text NOT NULL,
    jurisdiction text NOT NULL,
    parcel_identifier text,
    address_line text,
    city text,
    county text,
    county_fips text,
    state_code text,
    postal_code text,
    country_code text NOT NULL,
    permit_type text,
    work_type text,
    use_code text,
    description text,
    application_date date,
    issue_date date,
    final_date date,
    status text,
    project_value numeric(20,2),
    currency text,
    building_area numeric,
    applicant text,
    contractor text,
    developer text,
    property_owner text,
    verified_occupant text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    relevance_score numeric(4,3) NOT NULL CHECK (relevance_score >= 0 AND relevance_score <= 1),
    relevance_classification text NOT NULL CHECK (relevance_classification IN (
        'high_value_commercial','commercial_new_construction','commercial_expansion',
        'industrial','laboratory','warehouse','manufacturing','data_center','major_renovation','not_relevant'
    )),
    source_url text NOT NULL,
    content_hash text NOT NULL,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_observed_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,permit_number,content_hash),
    CHECK (project_value IS NULL OR currency IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS development_permits_jurisdiction_date_idx
    ON development_permits (country_code,state_code,county_fips,COALESCE(issue_date,application_date) DESC);
CREATE INDEX IF NOT EXISTS development_permits_relevance_idx
    ON development_permits (relevance_classification,relevance_score DESC);
CREATE INDEX IF NOT EXISTS development_permits_text_idx ON development_permits USING gin
    (to_tsvector('english',coalesce(description,'') || ' ' || coalesce(address_line,'')));

CREATE TABLE IF NOT EXISTS development_permit_versions (
    id bigserial PRIMARY KEY,
    permit_id uuid NOT NULL REFERENCES development_permits(id) ON DELETE CASCADE,
    source_record_fingerprint text NOT NULL UNIQUE,
    content_hash text NOT NULL,
    source_url text NOT NULL,
    collected_at timestamptz NOT NULL,
    raw_payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (permit_id,content_hash)
);
CREATE INDEX IF NOT EXISTS development_permit_versions_permit_idx
    ON development_permit_versions (permit_id,collected_at DESC);

CREATE TABLE IF NOT EXISTS permit_company_relationships (
    permit_id uuid NOT NULL REFERENCES development_permits(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    relationship_type text NOT NULL CHECK (relationship_type IN (
        'owner','tenant','occupant','developer','permit_applicant','contractor','other'
    )),
    matching_method text NOT NULL,
    matching_confidence numeric(4,3) NOT NULL CHECK (matching_confidence >= 0 AND matching_confidence <= 1),
    review_status text NOT NULL CHECK (review_status IN ('auto_verified','pending','approved','rejected')),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (permit_id,company_id,relationship_type)
);

CREATE TABLE IF NOT EXISTS movement_indicators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    indicator_fingerprint text NOT NULL UNIQUE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    event_id uuid REFERENCES company_events(id) ON DELETE SET NULL,
    permit_id uuid REFERENCES development_permits(id) ON DELETE SET NULL,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    as_of_date date NOT NULL,
    observed_at timestamptz NOT NULL,
    indicator_type text NOT NULL,
    direction text NOT NULL CHECK (direction IN ('positive','negative','neutral','unknown')),
    value numeric,
    country_code text,
    state_code text,
    county_fips text,
    city text,
    strength numeric(4,3) NOT NULL CHECK (strength >= 0 AND strength <= 1),
    reliability numeric(4,3) NOT NULL CHECK (reliability >= 0 AND reliability <= 1),
    confidence numeric(4,3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    associated_event_ids uuid[] NOT NULL DEFAULT '{}',
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movement_indicators_company_date_idx
    ON movement_indicators (company_id,as_of_date DESC);

CREATE TABLE IF NOT EXISTS movement_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_fingerprint text NOT NULL UNIQUE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    assessment_type text NOT NULL CHECK (assessment_type IN (
        'growth','contraction','relocation','market_entry','activity'
    )),
    as_of_date date NOT NULL,
    prediction_horizon_days integer,
    country_code text,
    state_code text,
    county_fips text,
    city text,
    score numeric(6,3),
    evidence_quality text NOT NULL CHECK (evidence_quality IN ('high','medium','low','insufficient')),
    data_sufficiency text NOT NULL CHECK (data_sufficiency IN (
        'sufficient','limited','insufficient_history'
    )),
    model_version text NOT NULL,
    components jsonb NOT NULL DEFAULT '{}'::jsonb,
    evidence_event_ids uuid[] NOT NULL DEFAULT '{}',
    explanation text NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS movement_assessments_company_date_idx
    ON movement_assessments (company_id,as_of_date DESC);

CREATE TABLE IF NOT EXISTS geographic_source_coverage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_system text NOT NULL REFERENCES data_sources(source_system),
    event_type text NOT NULL,
    country_code text NOT NULL,
    state_code text,
    county_fips text,
    coverage_start date,
    coverage_end date,
    update_frequency text,
    coverage_status text NOT NULL CHECK (coverage_status IN ('active','partial','historical','unavailable')),
    official_url text NOT NULL,
    known_limitations text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_system,event_type,country_code,state_code,county_fips)
);
CREATE INDEX IF NOT EXISTS geographic_source_coverage_region_idx
    ON geographic_source_coverage (country_code,state_code,event_type);

INSERT INTO data_sources (
    source_system,name,country_code,source_market,official_url,license_name,update_frequency,quality_status,metadata
) VALUES
    ('maryland_warn','Maryland WARN / ESA / Other Dislocations Log','US','US_MD_WARN',
     'https://www.labor.maryland.gov/employment/warn.shtml',NULL,'as published','unknown',
     '{"publisher":"Maryland Department of Labor","commercial_use_status":"unverified","scope":"current-year notices displayed by the agency"}'::jsonb),
    ('virginia_warn','Virginia Works WARN Notices','US','US_VA_WARN',
     'https://virginiaworks.gov/im-an-employer/retain-and-grow/warn-notices/',NULL,'as published','unknown',
     '{"publisher":"Virginia Works","commercial_use_status":"unverified","scope":"statewide official WARN table with direct notice-document links"}'::jsonb),
    ('maryland_commerce_press','Maryland Department of Commerce Press Room','US','US_MD_COMMERCE',
     'https://commerce.maryland.gov/press-room',NULL,'as published','unknown',
     '{"publisher":"Maryland Department of Commerce","commercial_use_status":"unverified","scope":"official press releases; event extraction is conservative"}'::jsonb),
    ('montgomery_county_commercial_permits','Montgomery County Commercial Permits','US','US_MD_MOCO_PERMITS',
     'https://data.montgomerycountymd.gov/d/i26v-w6bd','Montgomery County Open Data Terms of Use','daily','unknown',
     '{"publisher":"Montgomery County Department of Permitting Services","commercial_use_status":"permitted_with_conditions","dataset_id":"i26v-w6bd","scope":"commercial building permits issued since 2000","terms_url":"https://data.montgomerycountymd.gov/terms-of-use","attribution_required":true}'::jsonb),
    ('sec_edgar_submissions','SEC EDGAR Submissions API','US','US_SEC',
     'https://data.sec.gov/submissions/','SEC EDGAR public filing reuse policy','real time','unknown',
     '{"publisher":"U.S. Securities and Exchange Commission","commercial_use_status":"permitted","scope":"selected filings for companies with verified SEC CIK identifiers","requires_user_agent":true,"reuse_policy_url":"https://www.sec.gov/about/webmaster-frequently-asked-questions","filing_content_rights":"SEC states EDGAR public filing content is free to access and reuse"}'::jsonb)
ON CONFLICT (source_system) DO UPDATE SET
    name=EXCLUDED.name,
    source_market=EXCLUDED.source_market,
    official_url=EXCLUDED.official_url,
    update_frequency=EXCLUDED.update_frequency,
    metadata=data_sources.metadata || EXCLUDED.metadata,
    updated_at=now();

INSERT INTO geographic_source_coverage (
    source_system,event_type,country_code,state_code,coverage_start,update_frequency,
    coverage_status,official_url,known_limitations,metadata
) VALUES
    ('maryland_warn','workforce_reduction','US','MD','2026-01-01','as published','active',
     'https://www.labor.maryland.gov/employment/warn.shtml',
     'Current-year public log includes WARN, Maryland ESA, and other dislocations; inclusion does not mean every row independently meets federal WARN thresholds. Employee counts and effective dates are publisher-reported.',
     '{"license_status":"unverified","headquarters_inference":"prohibited"}'::jsonb),
    ('virginia_warn','workforce_reduction','US','VA',NULL,'as published','active',
     'https://virginiaworks.gov/im-an-employer/retain-and-grow/warn-notices/',
     'The official table publishes notice and impact dates, affected employees, locality, and notice type. Company-column addresses are retained as raw evidence and are not treated as an affected worksite or headquarters. Employee effects remain publisher-reported.',
     '{"license_status":"unverified","headquarters_inference":"prohibited","direct_notice_links":"retained_when_published"}'::jsonb),
    ('maryland_commerce_press','business_expansion','US','MD','2026-01-01','as published','partial',
     'https://commerce.maryland.gov/press-room',
     'Only official releases whose titles and text provide an explicit company expansion, facility, headquarters, investment, or job announcement are eligible. Announced commitments may not be completed outcomes.',
     '{"license_status":"unverified","numeric_claims":"announced_not_verified_outcomes"}'::jsonb),
    ('montgomery_county_commercial_permits','permit','US','MD','2000-01-01','daily','active',
     'https://data.montgomerycountymd.gov/d/i26v-w6bd',
     'Public commercial building permit data. The source does not identify a verified occupant, applicant, contractor, developer, property owner, or parcel in the published fields; no company relationship is inferred from an address or description alone.',
     '{"license_status":"terms_of_use","terms_url":"https://data.montgomerycountymd.gov/terms-of-use","attribution_required":true,"county_fips":"24031","company_matching":"disabled_without_named_party_evidence"}'::jsonb),
    ('sec_edgar_submissions','regulatory_disclosure','US',NULL,NULL,'real time','partial',
     'https://www.sec.gov/search-filings/edgar-application-programming-interfaces',
     'Coverage is limited to existing companies with verified SEC CIK identifiers and selected filing forms or 8-K items. A filing is evidence of disclosure, not proof that a funded expansion or facility project occurred.',
     '{"license_status":"permitted","reuse_policy_url":"https://www.sec.gov/about/webmaster-frequently-asked-questions","company_scope":"verified_cik_only","requires_user_agent":true}'::jsonb)
ON CONFLICT (source_system,event_type,country_code,state_code,county_fips) DO UPDATE SET
    update_frequency=EXCLUDED.update_frequency,
    coverage_status=EXCLUDED.coverage_status,
    official_url=EXCLUDED.official_url,
    known_limitations=EXCLUDED.known_limitations,
    metadata=geographic_source_coverage.metadata || EXCLUDED.metadata,
    updated_at=now();
