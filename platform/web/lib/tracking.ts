import "server-only";

import { query, withTransaction } from "@/lib/db";

export type RawTrackingParams = Record<string, string | string[] | undefined>;

export type TrackingInput = {
  industry?: string;
  state?: string;
  country?: string;
  reason?: string;
  signalType?: string;
  priority?: string;
  recency?: number;
  sort: "latest_signal" | "company_name" | "contract_activity" | "movement_activity" | "recent_change_count" | "priority";
};

export type IntelligenceTimelineRow = {
  id: string;
  category: "PROCUREMENT" | "WORKFORCE" | "FACILITY" | "CORPORATE";
  event_type: string;
  event_at: string;
  title: string | null;
  summary: string | null;
  value: string | null;
  currency: string | null;
  market: string;
  source_system: string;
  publisher: string | null;
  source_url: string;
  collected_at: string;
  verification_status: string;
  match_status: string;
};

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseTrackingInput(raw: RawTrackingParams): TrackingInput {
  const allowedSort = new Set<TrackingInput["sort"]>([
    "latest_signal", "company_name", "contract_activity", "movement_activity", "recent_change_count", "priority",
  ]);
  const sortValue = scalar(raw.sort) as TrackingInput["sort"] | undefined;
  const recency = Number.parseInt(scalar(raw.recency) || "", 10);
  return {
    industry: scalar(raw.industry)?.trim() || undefined,
    state: scalar(raw.state)?.trim().toUpperCase() || undefined,
    country: scalar(raw.country)?.trim().toUpperCase() || undefined,
    reason: scalar(raw.reason)?.trim() || undefined,
    signalType: scalar(raw.signal_type)?.trim() || undefined,
    priority: scalar(raw.priority)?.trim() || undefined,
    recency: [7, 30, 90, 365].includes(recency) ? recency : undefined,
    sort: sortValue && allowedSort.has(sortValue) ? sortValue : "latest_signal",
  };
}

export async function getTrackedCompanies(input: TrackingInput) {
  const clauses = ["t.tracking_status <> 'archived'"];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replace("?", `$${values.length}`));
  };
  if (input.industry) add("i.slug=?", input.industry);
  if (input.state) add("c.recipient_state=?", input.state);
  if (input.country) add("COALESCE(c.legal_entity_country,c.recipient_country)=?", input.country);
  if (input.reason) add("t.tracking_reason=?", input.reason);
  if (input.priority) add("t.priority=?", input.priority);
  if (input.recency) add("signals.last_signal_at >= now() - (?::int * interval '1 day')", input.recency);
  if (input.signalType === "contracts") clauses.push("procurement.latest_at IS NOT NULL");
  if (input.signalType === "movements") clauses.push("movement.latest_at IS NOT NULL");
  if (input.signalType === "permits") clauses.push("permit.latest_at IS NOT NULL");
  if (input.signalType === "sec") clauses.push("sec.latest_at IS NOT NULL");

  const sortSql: Record<TrackingInput["sort"], string> = {
    latest_signal: "signals.last_signal_at DESC NULLS LAST,c.canonical_name",
    company_name: "c.canonical_name",
    contract_activity: "contract_stats.award_count DESC,c.canonical_name",
    movement_activity: "signals.movement_count_30d DESC,c.canonical_name",
    recent_change_count: "signals.signal_count_30d DESC,c.canonical_name",
    priority: "CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,signals.last_signal_at DESC NULLS LAST",
  };

  const rowsPromise = query<any>(
    `SELECT t.id::text AS monitor_target_id,t.tracking_status,t.tracking_reason,t.priority,
     t.monitor_procurement,t.monitor_movements,t.monitor_permits,t.monitor_sec,t.added_at::text,t.updated_at::text,
     c.id::text AS company_id,c.slug,c.canonical_name,c.legal_name,c.uei,c.cage_code,
     c.recipient_city,c.recipient_state,c.recipient_country,c.legal_entity_country,
     i.name AS industry_name,i.slug AS industry_slug,cik.identifier_value AS cik,
     contract_stats.award_count,contract_stats.latest_award,
     procurement.title AS latest_contract_title,procurement.event_type AS latest_contract_type,
     procurement.latest_at AS latest_contract_event,procurement.market AS latest_contract_market,
     movement.title AS latest_movement_title,movement.event_type AS latest_movement_type,
     movement.latest_at AS latest_movement,movement.source_system AS latest_movement_source,
     permit.title AS latest_permit_title,permit.latest_at AS latest_permit,permit.source_system AS latest_permit_source,
     sec.title AS latest_sec_title,sec.latest_at AS latest_sec,
     checks.last_checked_at,signals.last_signal_at::text AS last_signal_at,signals.signal_count_7d,signals.signal_count_30d,
     signals.movement_count_30d,alerts.new_alerts,
     indications.expansion_score,indications.expansion_sufficiency,indications.relocation_score,indications.relocation_sufficiency,
     indications.growth_score,indications.growth_sufficiency,indications.contraction_score,indications.contraction_sufficiency,
     count(*) OVER()::text AS total
     FROM company_monitor_targets t JOIN companies c ON c.id=t.company_id
     LEFT JOIN industries i ON i.id=c.primary_industry_id
     LEFT JOIN LATERAL (
       SELECT identifier_value FROM entity_identifiers WHERE company_id=c.id AND is_verified
       AND upper(identifier_system) IN ('CIK','SEC_CIK') ORDER BY observed_at DESC LIMIT 1
     ) cik ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS award_count,max(award_date)::text AS latest_award
       FROM awards WHERE recipient_company_id=c.id AND NOT is_benchmark
     ) contract_stats ON true
     LEFT JOIN LATERAL (
       SELECT title,event_type,event_at::text AS latest_at,COALESCE(source_market,source_country) AS market
       FROM procurement_events WHERE company_id=c.id ORDER BY event_at DESC LIMIT 1
     ) procurement ON true
     LEFT JOIN LATERAL (
       SELECT e.title,e.event_type,COALESCE(e.event_date,e.effective_start_date,e.announced_date)::text AS latest_at,e.source_system
       FROM company_event_companies ec JOIN company_events e ON e.id=ec.event_id
       WHERE ec.company_id=c.id AND ec.review_status IN ('auto_verified','approved')
       AND e.source_system <> 'sec_edgar_submissions' AND e.verification_status <> 'rejected'
       ORDER BY COALESCE(e.event_date,e.effective_start_date,e.announced_date) DESC NULLS LAST LIMIT 1
     ) movement ON true
     LEFT JOIN LATERAL (
       SELECT p.permit_number AS title,COALESCE(p.issue_date,p.application_date)::text AS latest_at,p.source_system
       FROM permit_company_relationships r JOIN development_permits p ON p.id=r.permit_id
       WHERE r.company_id=c.id AND r.review_status IN ('auto_verified','approved')
       ORDER BY COALESCE(p.issue_date,p.application_date) DESC NULLS LAST LIMIT 1
     ) permit ON true
     LEFT JOIN LATERAL (
       SELECT e.title,COALESCE(e.event_date,e.announced_date)::text AS latest_at
       FROM company_event_companies ec JOIN company_events e ON e.id=ec.event_id
       WHERE ec.company_id=c.id AND ec.review_status IN ('auto_verified','approved')
       AND e.source_system='sec_edgar_submissions' AND e.verification_status <> 'rejected'
       ORDER BY COALESCE(e.event_date,e.announced_date) DESC NULLS LAST LIMIT 1
     ) sec ON true
     LEFT JOIN LATERAL (
       SELECT max(last_checked_at)::text AS last_checked_at FROM company_monitor_source_state
       WHERE company_monitor_target_id=t.id
     ) checks ON true
     LEFT JOIN LATERAL (
       SELECT max(event_at) AS last_signal_at,
       count(*) FILTER (WHERE event_at >= now()-interval '7 days')::int AS signal_count_7d,
       count(*) FILTER (WHERE event_at >= now()-interval '30 days')::int AS signal_count_30d,
       count(*) FILTER (WHERE category='movement' AND event_at >= now()-interval '30 days')::int AS movement_count_30d
       FROM (
         SELECT pe.event_at,'procurement'::text AS category FROM procurement_events pe WHERE pe.company_id=c.id
         UNION ALL
         SELECT COALESCE(ce.event_date,ce.effective_start_date,ce.announced_date)::timestamptz,'movement'
         FROM company_event_companies ec JOIN company_events ce ON ce.id=ec.event_id
         WHERE ec.company_id=c.id AND ec.review_status IN ('auto_verified','approved') AND ce.verification_status <> 'rejected'
         UNION ALL
         SELECT COALESCE(dp.issue_date,dp.application_date)::timestamptz,'permit'
         FROM permit_company_relationships pr JOIN development_permits dp ON dp.id=pr.permit_id
         WHERE pr.company_id=c.id AND pr.review_status IN ('auto_verified','approved')
       ) event_union
     ) signals ON true
     LEFT JOIN LATERAL (
       SELECT count(*)::int AS new_alerts FROM alert_events WHERE monitor_target_id=t.id AND seen_at IS NULL
     ) alerts ON true
     LEFT JOIN LATERAL (
       SELECT
       (max(score) FILTER (WHERE assessment_type='expansion'))::text AS expansion_score,
       max(data_sufficiency) FILTER (WHERE assessment_type='expansion') AS expansion_sufficiency,
       (max(score) FILTER (WHERE assessment_type='relocation'))::text AS relocation_score,
       max(data_sufficiency) FILTER (WHERE assessment_type='relocation') AS relocation_sufficiency,
       (max(score) FILTER (WHERE assessment_type='growth'))::text AS growth_score,
       max(data_sufficiency) FILTER (WHERE assessment_type='growth') AS growth_sufficiency,
       (max(score) FILTER (WHERE assessment_type='contraction'))::text AS contraction_score,
       max(data_sufficiency) FILTER (WHERE assessment_type='contraction') AS contraction_sufficiency
       FROM (SELECT DISTINCT ON (assessment_type) assessment_type,score,data_sufficiency
             FROM movement_assessments WHERE company_id=c.id AND model_version='company-change-indication-v2'
             ORDER BY assessment_type,as_of_date DESC,generated_at DESC) current_assessments
     ) indications ON true
     WHERE ${clauses.join(" AND ")}
     ORDER BY ${sortSql[input.sort]} LIMIT 100`,
    values,
  );
  const optionsPromise = Promise.all([
    query<{ slug: string; name: string }>("SELECT slug,name FROM industries ORDER BY name"),
    query<{ value: string }>("SELECT DISTINCT recipient_state AS value FROM companies WHERE recipient_state IS NOT NULL ORDER BY value"),
    query<{ value: string }>("SELECT DISTINCT COALESCE(legal_entity_country,recipient_country) AS value FROM companies WHERE COALESCE(legal_entity_country,recipient_country) IS NOT NULL ORDER BY value"),
  ]);
  const [rows, [industries, states, countries]] = await Promise.all([rowsPromise, optionsPromise]);
  return { rows, total: Number(rows[0]?.total || 0), industries, states, countries };
}

export async function getTrackingOverview() {
  const rows = await query<any>(
    `SELECT count(*)::int AS monitor_targets,
     count(*) FILTER (WHERE tracking_status='active')::int AS active_targets,
     count(*) FILTER (WHERE tracking_status='paused')::int AS paused_targets,
     count(*) FILTER (WHERE tracking_status='review_required')::int AS review_required,
     count(*) FILTER (WHERE priority='high' AND tracking_status='active')::int AS high_priority,
     (SELECT count(*)::int FROM alert_events WHERE user_id IS NULL AND seen_at IS NULL) AS new_alerts,
     (SELECT count(*)::int FROM company_monitor_source_state WHERE status='error') AS sources_with_errors
     FROM company_monitor_targets`,
  );
  return rows[0];
}

export async function getCompanyTracking(companyId: string) {
  const targets = await query<any>(
    `SELECT t.id::text,t.tracking_status,t.tracking_reason,t.priority,t.added_at::text,t.last_reviewed_at::text,
     t.monitor_procurement,t.monitor_movements,t.monitor_permits,t.monitor_sec,t.monitor_hiring,t.monitor_property,
     count(a.id) FILTER (WHERE a.seen_at IS NULL)::int AS new_alerts,
     count(a.id) FILTER (WHERE a.event_date >= current_date - 30)::int AS signal_count_30d,
     max(a.event_date)::text AS last_signal_at
     FROM company_monitor_targets t LEFT JOIN alert_events a ON a.monitor_target_id=t.id
     WHERE t.company_id=$1 GROUP BY t.id`,
    [companyId],
  );
  const target = targets?.[0] || null;
  if (!target) return { target: null, coverage: [] };
  const coverage = await query<any>(
    `SELECT s.source_system,d.name,d.source_market,d.official_url,s.status,s.status_detail,
     s.last_checked_at::text,s.last_success_at::text,s.last_new_record_at::text,s.records_seen::text,s.new_records::text,
     string_agg(DISTINCT concat_ws(' ',g.country_code,g.state_code,g.county_fips),', ' ORDER BY concat_ws(' ',g.country_code,g.state_code,g.county_fips)) AS coverage
     FROM company_monitor_source_state s JOIN data_sources d ON d.source_system=s.source_system
     LEFT JOIN geographic_source_coverage g ON g.source_system=s.source_system
     WHERE s.company_monitor_target_id=$1
     GROUP BY s.source_system,d.name,d.source_market,d.official_url,s.status,s.status_detail,
       s.last_checked_at,s.last_success_at,s.last_new_record_at,s.records_seen,s.new_records
     ORDER BY d.source_market,d.name`,
    [target.id],
  );
  return { target, coverage };
}

export async function getCompanyIntelligenceTimeline(companyId: string): Promise<IntelligenceTimelineRow[]> {
  return (await query<IntelligenceTimelineRow>(
    `SELECT * FROM (
       SELECT 'procurement:'||e.id::text AS id,'PROCUREMENT'::text AS category,e.event_type,
       e.event_at::text AS event_at,e.title,e.description AS summary,
       COALESCE(e.value_delta_native,e.value_native)::text AS value,e.currency,
       COALESCE(e.source_market,e.source_country) AS market,e.source_system,d.name AS publisher,e.source_url,
       e.created_at::text AS collected_at,'source_backed'::text AS verification_status,'auto_verified'::text AS match_status
       FROM procurement_events e LEFT JOIN data_sources d ON d.source_system=e.source_system
       WHERE e.company_id=$1
       UNION ALL
       SELECT 'movement:'||e.id::text,
       CASE WHEN e.source_system='sec_edgar_submissions' THEN 'CORPORATE'
            WHEN e.event_type IN ('layoff','closure','furlough','hiring') THEN 'WORKFORCE'
            WHEN e.event_type IN ('new_facility','facility_expansion','relocation','headquarters_move','opening') THEN 'FACILITY'
            ELSE 'CORPORATE' END,
       e.event_type,COALESCE(e.event_date,e.effective_start_date,e.announced_date)::timestamptz::text,
       e.title,e.summary,e.capital_investment::text,e.currency,COALESCE(d.source_market,e.source_country),e.source_system,
       source.publisher,source.original_url,source.collected_at::text,e.verification_status,ec.review_status
       FROM company_event_companies ec JOIN company_events e ON e.id=ec.event_id
       LEFT JOIN data_sources d ON d.source_system=e.source_system
       JOIN LATERAL (
         SELECT publisher,original_url,collected_at FROM company_event_sources WHERE event_id=e.id
         ORDER BY is_primary DESC,collected_at DESC LIMIT 1
       ) source ON true
       WHERE ec.company_id=$1 AND ec.review_status <> 'rejected' AND e.verification_status <> 'rejected'
       UNION ALL
       SELECT 'permit:'||p.id::text,'FACILITY',p.relevance_classification,
       COALESCE(p.issue_date,p.application_date)::timestamptz::text,p.permit_number,p.description,
       p.project_value::text,p.currency,COALESCE(d.source_market,p.country_code),p.source_system,d.name,p.source_url,
       p.last_observed_at::text,'source_backed',r.review_status
       FROM permit_company_relationships r JOIN development_permits p ON p.id=r.permit_id
       LEFT JOIN data_sources d ON d.source_system=p.source_system
       WHERE r.company_id=$1 AND r.review_status IN ('auto_verified','approved')
     ) timeline ORDER BY event_at DESC NULLS LAST,id DESC LIMIT 250`,
    [companyId],
  )) || [];
}

export async function getDiscoveredCompanies() {
  return query<any>(
    `SELECT d.id::text,d.discovery_reason,d.source_system,d.source_type,d.source_id,d.source_url,
     d.event_date::text,d.match_status,d.discovery_status,d.observed_company_name,d.evidence,
     c.id::text AS company_id,c.slug,c.canonical_name,c.legal_name,c.uei,c.cage_code,c.recipient_city,c.recipient_state,
     t.tracking_status,indications.expansion_score,indications.expansion_sufficiency,
     indications.relocation_score,indications.relocation_sufficiency,indications.growth_score,
     indications.growth_sufficiency,indications.contraction_score,indications.contraction_sufficiency
     FROM company_discoveries d LEFT JOIN companies c ON c.id=d.company_id
     LEFT JOIN company_monitor_targets t ON t.company_id=d.company_id
     LEFT JOIN LATERAL (
       SELECT
       (max(score) FILTER (WHERE assessment_type='expansion'))::text AS expansion_score,
       max(data_sufficiency) FILTER (WHERE assessment_type='expansion') AS expansion_sufficiency,
       (max(score) FILTER (WHERE assessment_type='relocation'))::text AS relocation_score,
       max(data_sufficiency) FILTER (WHERE assessment_type='relocation') AS relocation_sufficiency,
       (max(score) FILTER (WHERE assessment_type='growth'))::text AS growth_score,
       max(data_sufficiency) FILTER (WHERE assessment_type='growth') AS growth_sufficiency,
       (max(score) FILTER (WHERE assessment_type='contraction'))::text AS contraction_score,
       max(data_sufficiency) FILTER (WHERE assessment_type='contraction') AS contraction_sufficiency
       FROM (SELECT DISTINCT ON (assessment_type) assessment_type,score,data_sufficiency
             FROM movement_assessments WHERE company_id=c.id AND model_version='company-change-indication-v2'
             ORDER BY assessment_type,as_of_date DESC,generated_at DESC) current_assessments
     ) indications ON true
     WHERE d.discovery_status <> 'dismissed'
     ORDER BY d.event_date DESC NULLS LAST,d.created_at DESC LIMIT 250`,
  );
}

export type AlertEventRow = {
  id: string;
  alert_type: string;
  title: string;
  summary: string | null;
  event_date: string | null;
  market: string | null;
  source_type: string | null;
  source_system: string;
  source_url: string;
  match_status: string | null;
  created_at: string;
  seen_at: string | null;
  slug: string | null;
  canonical_name: string | null;
};

export async function getAlertEvents() {
  return query<AlertEventRow>(
    `SELECT a.id::text,a.alert_type,a.title,a.summary,a.event_date::text,a.market,a.source_type,a.source_system,
     a.source_url,a.match_status,a.created_at::text,a.seen_at::text,c.slug,c.canonical_name
     FROM alert_events a LEFT JOIN companies c ON c.id=a.company_id
     WHERE a.user_id IS NULL
     ORDER BY (a.seen_at IS NULL) DESC,a.event_date DESC,a.created_at DESC LIMIT 250`,
  );
}

export async function getAdminTrackingSnapshot(search = "") {
  const pattern = `%${search.trim()}%`;
  const [companies, targets, discoveries, reviews] = await Promise.all([
    query<any>(
      `SELECT c.id::text,c.slug,c.canonical_name,c.legal_name,c.uei,c.cage_code,c.recipient_city,c.recipient_state,
       cik.identifier_value AS cik,p.canonical_name AS parent_company_name,t.tracking_status,t.priority
       FROM companies c LEFT JOIN companies p ON p.id=c.parent_company_id
       LEFT JOIN company_monitor_targets t ON t.company_id=c.id
       LEFT JOIN LATERAL (
         SELECT identifier_value FROM entity_identifiers WHERE company_id=c.id AND is_verified
         AND upper(identifier_system) IN ('CIK','SEC_CIK') ORDER BY observed_at DESC LIMIT 1
       ) cik ON true
       WHERE NOT c.is_benchmark AND ($1='' OR c.canonical_name ILIKE $2 OR c.legal_name ILIKE $2
         OR c.uei ILIKE $2 OR c.cage_code ILIKE $2)
       ORDER BY (t.id IS NOT NULL) DESC,c.canonical_name LIMIT 30`,
      [search.trim(), pattern],
    ),
    query<any>(
      `SELECT t.id::text,t.company_id::text,t.tracking_status,t.tracking_reason,t.priority,
       t.monitor_procurement,t.monitor_movements,t.monitor_permits,t.monitor_sec,c.canonical_name,c.slug,c.uei,c.cage_code
       FROM company_monitor_targets t JOIN companies c ON c.id=t.company_id
       ORDER BY CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,c.canonical_name`,
    ),
    query<any>(
      `SELECT d.id::text,d.company_id::text,d.observed_company_name,d.discovery_reason,d.source_system,
       d.event_date::text,d.match_status,d.discovery_status,d.source_url,c.slug,c.canonical_name,c.legal_name,
       c.uei,c.cage_code,t.tracking_status
       FROM company_discoveries d LEFT JOIN companies c ON c.id=d.company_id
       LEFT JOIN company_monitor_targets t ON t.company_id=d.company_id
       WHERE d.discovery_status IN ('new','under_review')
       ORDER BY d.event_date DESC NULLS LAST,d.created_at DESC LIMIT 100`,
    ),
    query<any>(
      `SELECT r.id::text,r.observed_company_name,r.match_status,r.matching_method,r.confidence::text,r.evidence,
       r.created_at::text,r.reviewed_by,r.reviewed_at::text,source.original_url,source.publisher,
       e.id::text AS event_id,e.title AS event_title,e.event_type,
       c.id::text AS candidate_company_id,c.slug,c.canonical_name,c.legal_name,c.uei,c.cage_code,
       cik.identifier_value AS cik,c.recipient_city,c.recipient_state,p.canonical_name AS parent_company_name
       FROM company_match_reviews r JOIN company_event_sources source ON source.id=r.source_id
       JOIN company_events e ON e.id=source.event_id
       LEFT JOIN companies c ON c.id=r.candidate_company_id
       LEFT JOIN companies p ON p.id=c.parent_company_id
       LEFT JOIN LATERAL (
         SELECT identifier_value FROM entity_identifiers WHERE company_id=c.id AND is_verified
         AND upper(identifier_system) IN ('CIK','SEC_CIK') ORDER BY observed_at DESC LIMIT 1
       ) cik ON true
       WHERE r.match_status IN ('pending','ambiguous','unmatched')
       ORDER BY CASE r.match_status WHEN 'pending' THEN 0 WHEN 'ambiguous' THEN 1 ELSE 2 END,r.created_at DESC LIMIT 100`,
    ),
  ]);
  return { companies, targets, discoveries, reviews };
}

export async function updateCompanyDiscovery(input: {
  discoveryId: string;
  status: "under_review" | "dismissed";
  actor: string;
}) {
  return withTransaction(async (client) => {
    const result = await client.query<any>(
      `UPDATE company_discoveries SET discovery_status=$1,reviewed_by=$2,reviewed_at=now(),updated_at=now()
       WHERE id=$3 RETURNING id::text,company_id::text,discovery_status,reviewed_by,reviewed_at::text`,
      [input.status, input.actor, input.discoveryId],
    );
    if (!result.rows[0]) throw new Error("Discovery not found");
    return result.rows[0];
  });
}

export async function createMonitorTarget(input: {
  companyId: string;
  reason: string;
  priority: string;
  actor: string;
  monitorProcurement?: boolean;
  monitorMovements?: boolean;
  monitorPermits?: boolean;
  monitorSec?: boolean;
}) {
  return withTransaction(async (client) => {
    const company = await client.query(
      "SELECT id::text,canonical_name FROM companies WHERE id=$1 AND NOT is_benchmark",
      [input.companyId],
    );
    if (!company.rows[0]) throw new Error("Canonical company not found");
    const previous = await client.query("SELECT * FROM company_monitor_targets WHERE company_id=$1", [input.companyId]);
    const target = await client.query<any>(
      `INSERT INTO company_monitor_targets (company_id,tracking_status,tracking_reason,priority,added_by,
       monitor_procurement,monitor_movements,monitor_permits,monitor_sec)
       VALUES ($1,'active',$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (company_id) DO UPDATE SET
       tracking_status='active',tracking_reason=EXCLUDED.tracking_reason,priority=EXCLUDED.priority,
       monitor_procurement=EXCLUDED.monitor_procurement,monitor_movements=EXCLUDED.monitor_movements,
       monitor_permits=EXCLUDED.monitor_permits,monitor_sec=EXCLUDED.monitor_sec,
       last_reviewed_at=now(),updated_at=now() RETURNING *`,
      [
        input.companyId, input.reason, input.priority, input.actor,
        input.monitorProcurement ?? true, input.monitorMovements ?? true,
        input.monitorPermits ?? true, input.monitorSec ?? true,
      ],
    );
    await client.query(
      `INSERT INTO company_monitor_target_audit (monitor_target_id,action,previous_values,new_values,acted_by)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)`,
      [target.rows[0].id, previous.rows[0] ? "activated" : "created", JSON.stringify(previous.rows[0] || {}), JSON.stringify(target.rows[0]), input.actor],
    );
    const disabledSources = [
      ...(input.monitorProcurement === false ? ["usaspending", "uk_find_a_tender", "eu_ted"] : []),
      ...(input.monitorMovements === false ? ["maryland_warn", "virginia_warn", "maryland_commerce_press"] : []),
      ...(input.monitorPermits === false ? ["montgomery_county_commercial_permits"] : []),
      ...(input.monitorSec === false ? ["sec_edgar_submissions"] : []),
    ];
    await client.query(
      `INSERT INTO company_monitor_source_state (company_monitor_target_id,source_system,status,status_detail)
       SELECT $1,source_system,
       CASE WHEN source_system=ANY($3::text[]) THEN 'not_applicable' ELSE 'unsupported' END,
       CASE WHEN source_system=ANY($3::text[]) THEN 'Monitoring for this source family is disabled for this target.'
            ELSE 'Awaiting first tracked-company evaluation.' END
       FROM data_sources
       WHERE source_system=ANY($2::text[]) ON CONFLICT (company_monitor_target_id,source_system) DO NOTHING`,
      [target.rows[0].id, ["usaspending", "uk_find_a_tender", "eu_ted", "maryland_warn", "virginia_warn", "maryland_commerce_press", "montgomery_county_commercial_permits", "sec_edgar_submissions"], disabledSources],
    );
    await client.query(
      "UPDATE company_discoveries SET discovery_status='tracked',reviewed_by=$1,reviewed_at=now() WHERE company_id=$2 AND discovery_status IN ('new','under_review')",
      [input.actor, input.companyId],
    );
    return { ...target.rows[0], company: company.rows[0] };
  });
}

export async function updateMonitorTarget(input: {
  companyId: string;
  status?: string;
  priority?: string;
  actor: string;
  monitorProcurement?: boolean;
  monitorMovements?: boolean;
  monitorPermits?: boolean;
  monitorSec?: boolean;
}) {
  return withTransaction(async (client) => {
    const before = await client.query<any>("SELECT * FROM company_monitor_targets WHERE company_id=$1", [input.companyId]);
    if (!before.rows[0]) throw new Error("Monitor target not found");
    const after = await client.query<any>(
      `UPDATE company_monitor_targets SET tracking_status=COALESCE($1,tracking_status),
       priority=COALESCE($2,priority),monitor_procurement=COALESCE($3,monitor_procurement),
       monitor_movements=COALESCE($4,monitor_movements),monitor_permits=COALESCE($5,monitor_permits),
       monitor_sec=COALESCE($6,monitor_sec),last_reviewed_at=now(),updated_at=now()
       WHERE company_id=$7 RETURNING *`,
      [
        input.status || null, input.priority || null,
        input.monitorProcurement ?? null, input.monitorMovements ?? null,
        input.monitorPermits ?? null, input.monitorSec ?? null, input.companyId,
      ],
    );
    const sourceChanged = [input.monitorProcurement, input.monitorMovements, input.monitorPermits, input.monitorSec].some((value) => value !== undefined);
    const action = input.status === "paused" ? "paused" : input.status === "archived" ? "archived" : input.status === "review_required" ? "review_required" : input.status === "active" ? "activated" : sourceChanged ? "sources_changed" : "priority_changed";
    await client.query(
      `INSERT INTO company_monitor_target_audit (monitor_target_id,action,previous_values,new_values,acted_by)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)`,
      [after.rows[0].id, action, JSON.stringify(before.rows[0]), JSON.stringify(after.rows[0]), input.actor],
    );
    const sourceChanges: Array<[boolean | undefined, string[]]> = [
      [input.monitorProcurement, ["usaspending", "uk_find_a_tender", "eu_ted"]],
      [input.monitorMovements, ["maryland_warn", "virginia_warn", "maryland_commerce_press"]],
      [input.monitorPermits, ["montgomery_county_commercial_permits"]],
      [input.monitorSec, ["sec_edgar_submissions"]],
    ];
    for (const [enabled, sourceSystems] of sourceChanges) {
      if (enabled === undefined) continue;
      await client.query(
        `UPDATE company_monitor_source_state SET status=$1,status_detail=$2,updated_at=now()
         WHERE company_monitor_target_id=$3 AND source_system=ANY($4::text[])`,
        [
          enabled ? "unsupported" : "not_applicable",
          enabled ? "Monitoring enabled; awaiting the next tracked-company evaluation." : "Monitoring for this source family is disabled for this target.",
          after.rows[0].id,
          sourceSystems,
        ],
      );
    }
    return after.rows[0];
  });
}

export async function decideMatchReview(input: { reviewId: string; decision: "approved" | "rejected" | "pending"; actor: string }) {
  return withTransaction(async (client) => {
    const result = await client.query<any>(
      `SELECT r.*,source.event_id,source.original_url FROM company_match_reviews r
       JOIN company_event_sources source ON source.id=r.source_id WHERE r.id=$1 FOR UPDATE`,
      [input.reviewId],
    );
    const review = result.rows[0];
    if (!review) throw new Error("Review not found");
    if (input.decision === "approved" && !review.candidate_company_id) throw new Error("Select an exact company before approval");
    await client.query(
      "UPDATE company_match_reviews SET match_status=$1,reviewed_by=$2,reviewed_at=now() WHERE id=$3",
      [input.decision, input.actor, input.reviewId],
    );
    if (review.candidate_company_id && input.decision === "approved") {
      await client.query(
        `INSERT INTO company_event_companies (event_id,company_id,observed_company_name,relationship_type,is_primary,
         matching_method,matching_confidence,matching_evidence,review_status)
         VALUES ($1,$2,$3,'subject',true,$4,$5,$6::jsonb,'approved')
         ON CONFLICT (event_id,company_id,relationship_type) DO UPDATE SET review_status='approved',
         matching_evidence=EXCLUDED.matching_evidence`,
        [review.event_id, review.candidate_company_id, review.observed_company_name, review.matching_method || "analyst_review", review.confidence || 0, JSON.stringify({ ...(review.evidence || {}), approved_by: input.actor, source_url: review.original_url })],
      );
    }
    if (review.candidate_company_id && input.decision === "rejected") {
      await client.query(
        "UPDATE company_event_companies SET review_status='rejected' WHERE event_id=$1 AND company_id=$2",
        [review.event_id, review.candidate_company_id],
      );
    }
    await client.query(
      `INSERT INTO company_match_review_actions (review_id,previous_status,new_status,acted_by)
       VALUES ($1,$2,$3,$4)`,
      [input.reviewId, review.match_status, input.decision, input.actor],
    );
    return { reviewId: input.reviewId, previousStatus: review.match_status, newStatus: input.decision };
  });
}
