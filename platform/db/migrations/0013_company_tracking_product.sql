-- Platform-owned company tracking, discovery, monitoring state, and deduplicated
-- alerts. This registry is deliberately separate from user-specific
-- company_watches and does not duplicate procurement or movement events.

CREATE TABLE IF NOT EXISTS company_monitor_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tracking_status text NOT NULL DEFAULT 'active' CHECK (tracking_status IN (
        'active','paused','review_required','archived'
    )),
    tracking_reason text NOT NULL CHECK (tracking_reason IN (
        'manually_added','procurement_activity','movement_signal','permit_signal','sec_signal',
        'saved_search_match','analyst_review','other'
    )),
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','normal','low')),
    added_by text NOT NULL,
    added_at timestamptz NOT NULL DEFAULT now(),
    last_reviewed_at timestamptz,
    notes text,
    monitor_procurement boolean NOT NULL DEFAULT true,
    monitor_movements boolean NOT NULL DEFAULT true,
    monitor_permits boolean NOT NULL DEFAULT true,
    monitor_sec boolean NOT NULL DEFAULT true,
    monitor_hiring boolean NOT NULL DEFAULT false,
    monitor_property boolean NOT NULL DEFAULT false,
    track_corporate_family boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (company_id)
);
CREATE INDEX IF NOT EXISTS company_monitor_targets_status_priority_idx
    ON company_monitor_targets (tracking_status,priority,updated_at DESC);

CREATE TABLE IF NOT EXISTS company_monitor_target_audit (
    id bigserial PRIMARY KEY,
    monitor_target_id uuid NOT NULL REFERENCES company_monitor_targets(id) ON DELETE CASCADE,
    action text NOT NULL CHECK (action IN (
        'created','activated','paused','archived','review_required','priority_changed','sources_changed','notes_changed','reviewed'
    )),
    previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    acted_by text NOT NULL,
    acted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_monitor_target_audit_target_idx
    ON company_monitor_target_audit (monitor_target_id,acted_at DESC);

CREATE TABLE IF NOT EXISTS company_monitor_source_state (
    company_monitor_target_id uuid NOT NULL REFERENCES company_monitor_targets(id) ON DELETE CASCADE,
    source_system text NOT NULL REFERENCES data_sources(source_system),
    last_checked_at timestamptz,
    last_success_at timestamptz,
    last_new_record_at timestamptz,
    last_source_cursor text,
    last_error_at timestamptz,
    last_error_message text,
    status text NOT NULL DEFAULT 'unsupported' CHECK (status IN (
        'healthy','partial','error','unsupported','not_applicable'
    )),
    status_detail text,
    records_seen bigint NOT NULL DEFAULT 0,
    new_records bigint NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (company_monitor_target_id,source_system)
);
CREATE INDEX IF NOT EXISTS company_monitor_source_state_status_idx
    ON company_monitor_source_state (status,last_checked_at DESC);

CREATE TABLE IF NOT EXISTS company_discoveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dedupe_key text NOT NULL UNIQUE,
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    observed_company_name text,
    discovery_reason text NOT NULL CHECK (discovery_reason IN (
        'new_award','contract_change','movement_signal','permit_signal','sec_signal','saved_search_match','other'
    )),
    source_system text NOT NULL REFERENCES data_sources(source_system),
    source_type text NOT NULL,
    source_id text NOT NULL,
    source_url text NOT NULL,
    event_date date,
    match_status text NOT NULL CHECK (match_status IN (
        'auto_verified','approved','pending','ambiguous','unmatched','rejected'
    )),
    discovery_status text NOT NULL DEFAULT 'new' CHECK (discovery_status IN (
        'new','under_review','tracked','dismissed'
    )),
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    first_observed_at timestamptz NOT NULL DEFAULT now(),
    last_observed_at timestamptz NOT NULL DEFAULT now(),
    reviewed_by text,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_discoveries_status_date_idx
    ON company_discoveries (discovery_status,event_date DESC);
CREATE INDEX IF NOT EXISTS company_discoveries_company_date_idx
    ON company_discoveries (company_id,event_date DESC) WHERE company_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS alert_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dedupe_key text NOT NULL UNIQUE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
    saved_search_id uuid REFERENCES saved_searches(id) ON DELETE CASCADE,
    monitor_target_id uuid REFERENCES company_monitor_targets(id) ON DELETE CASCADE,
    alert_type text NOT NULL CHECK (alert_type IN (
        'new_award','contract_modified','procurement_event','movement_event','permit_event','sec_filing',
        'saved_search_match','region_event'
    )),
    title text NOT NULL,
    summary text,
    event_date date NOT NULL,
    market text,
    source_type text NOT NULL,
    source_id text NOT NULL,
    source_system text NOT NULL,
    source_url text NOT NULL,
    match_status text,
    created_at timestamptz NOT NULL DEFAULT now(),
    seen_at timestamptz,
    delivered_at timestamptz,
    CHECK (user_id IS NOT NULL OR monitor_target_id IS NOT NULL OR saved_search_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS alert_events_new_idx
    ON alert_events (created_at DESC) WHERE seen_at IS NULL;
CREATE INDEX IF NOT EXISTS alert_events_company_date_idx
    ON alert_events (company_id,event_date DESC) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS alert_events_monitor_date_idx
    ON alert_events (monitor_target_id,event_date DESC) WHERE monitor_target_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS company_match_review_actions (
    id bigserial PRIMARY KEY,
    review_id uuid NOT NULL REFERENCES company_match_reviews(id) ON DELETE CASCADE,
    previous_status text NOT NULL,
    new_status text NOT NULL CHECK (new_status IN ('approved','rejected','pending','ambiguous','unmatched')),
    acted_by text NOT NULL,
    notes text,
    acted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_match_review_actions_review_idx
    ON company_match_review_actions (review_id,acted_at DESC);

DROP TRIGGER IF EXISTS company_monitor_targets_set_updated_at ON company_monitor_targets;
CREATE TRIGGER company_monitor_targets_set_updated_at BEFORE UPDATE ON company_monitor_targets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS company_discoveries_set_updated_at ON company_discoveries;
CREATE TRIGGER company_discoveries_set_updated_at BEFORE UPDATE ON company_discoveries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
