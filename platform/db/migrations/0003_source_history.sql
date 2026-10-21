-- Append-only evidence for source revisions. The existing tables remain the
-- latest snapshots used by normal reads; these version tables retain history.

CREATE TABLE IF NOT EXISTS raw_source_transaction_versions (
    id bigserial PRIMARY KEY,
    source text NOT NULL,
    source_transaction_id text NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT now(),
    source_last_modified timestamptz,
    payload_hash char(64) NOT NULL,
    payload jsonb NOT NULL,
    UNIQUE (source, source_transaction_id, payload_hash)
);
CREATE INDEX IF NOT EXISTS raw_source_transaction_versions_lookup_idx
    ON raw_source_transaction_versions (source, source_transaction_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS company_geography_observation_versions (
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    source_transaction_id text NOT NULL,
    payload_hash char(64) NOT NULL,
    observed_at timestamptz NOT NULL DEFAULT now(),
    recipient_address text,
    recipient_city text,
    recipient_county text,
    recipient_county_fips text,
    recipient_state text,
    recipient_state_fips text,
    recipient_zip text,
    recipient_country text,
    PRIMARY KEY (company_id, source_transaction_id, payload_hash)
);
CREATE INDEX IF NOT EXISTS company_geography_versions_fips_idx
    ON company_geography_observation_versions (company_id, recipient_county_fips);

CREATE TABLE IF NOT EXISTS award_identity_observation_versions (
    source_transaction_id text NOT NULL,
    payload_hash char(64) NOT NULL,
    award_id uuid NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
    generated_award_id text,
    piid text,
    recipient_uei text,
    observed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (source_transaction_id, payload_hash)
);
CREATE INDEX IF NOT EXISTS award_identity_versions_piid_idx
    ON award_identity_observation_versions (piid);
