import "server-only";

import { query } from "@/lib/db";

export const BUSINESS_CHANGE_TABS = [
  "opening", "growing", "moving", "closing", "shrinking", "new-businesses",
] as const;

export type BusinessChangeTab = (typeof BUSINESS_CHANGE_TABS)[number];
export type BusinessChangeParams = Record<string, string | string[] | undefined>;

export type BusinessChangeInput = {
  tab: BusinessChangeTab;
  period: "7" | "30" | "90" | "365" | "custom";
  dateFrom?: string;
  dateTo?: string;
  state?: string;
  county?: string;
  city?: string;
  postalCode?: string;
  industry?: string;
  confidence?: "strong" | "moderate" | "early" | "confirmed";
  sourceFamily?: string;
  page: number;
  pageSize: number;
};

export type BusinessChangeRow = {
  record_id: string;
  category: BusinessChangeTab;
  layer: "outcome" | "event" | "indication" | "registration";
  business_name: string;
  what_changed: string;
  record_status: string;
  band: string;
  score: string | number | null;
  confidence: string | number | null;
  record_date: string;
  first_observed_at: string | null;
  country_code: string | null;
  state_code: string | null;
  county: string | null;
  county_fips: string | null;
  city: string | null;
  postal_code: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  location_precision: string;
  source_family: string | null;
  source_system: string | null;
  source_url: string | null;
  sources: Array<{ source_system?: string; source_url?: string; label?: string }> | null;
  evidence: unknown;
  origin: Record<string, unknown> | null;
  destination: Record<string, unknown> | null;
  company_slug: string | null;
  establishment_id: string | null;
  industry_slug: string | null;
  industry_label: string | null;
};

export type BusinessChangeCoverageRow = {
  signal_family: string;
  source_system: string | null;
  source_name: string;
  country_code: string;
  state_code: string | null;
  county_fips: string | null;
  coverage_status: "available" | "partial" | "unsupported" | "planned";
  reuse_status: string;
  update_frequency: string | null;
  official_url: string | null;
  limitations: string;
  fields_available: string[];
};

function one(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

function validDate(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function parseBusinessChangeInput(raw: BusinessChangeParams): BusinessChangeInput {
  const tabValue = one(raw.tab);
  const periodValue = one(raw.period);
  const confidenceValue = one(raw.confidence);
  const page = Number.parseInt(one(raw.page) || "1", 10);
  const pageSize = Number.parseInt(one(raw.page_size) || "25", 10);
  return {
    tab: BUSINESS_CHANGE_TABS.includes(tabValue as BusinessChangeTab) ? tabValue as BusinessChangeTab : "opening",
    period: ["7", "30", "90", "365", "custom"].includes(periodValue || "")
      ? periodValue as BusinessChangeInput["period"]
      : "90",
    dateFrom: validDate(one(raw.date_from)),
    dateTo: validDate(one(raw.date_to)),
    state: one(raw.state)?.toUpperCase(),
    county: one(raw.county),
    city: one(raw.city),
    postalCode: one(raw.postal_code),
    industry: one(raw.industry),
    confidence: ["strong", "moderate", "early", "confirmed"].includes(confidenceValue || "")
      ? confidenceValue as BusinessChangeInput["confidence"]
      : undefined,
    sourceFamily: one(raw.source_family),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) ? Math.max(1, Math.min(pageSize, 100)) : 25,
  };
}

class SqlWhere {
  clauses: string[] = [];
  values: unknown[] = [];

  add(clause: string, value: unknown): void {
    this.values.push(value);
    this.clauses.push(clause.replace("?", `$${this.values.length}`));
  }

  clone(): SqlWhere {
    const next = new SqlWhere();
    next.clauses = [...this.clauses];
    next.values = [...this.values];
    return next;
  }

  text(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(" AND ")}` : "";
  }
}

function filters(input: BusinessChangeInput): SqlWhere {
  const where = new SqlWhere();
  if (input.period === "custom") {
    if (input.dateFrom) where.add("r.record_date >= ?::date", input.dateFrom);
    if (input.dateTo) where.add("r.record_date <= ?::date", input.dateTo);
  } else {
    where.add("r.record_date >= current_date - (?::int - 1)", Number(input.period));
  }
  if (input.state) where.add("r.state_code = ?", input.state);
  if (input.county) {
    if (/^\d{5}$/.test(input.county)) where.add("r.county_fips = ?", input.county);
    else where.add("r.county ILIKE '%' || ? || '%'", input.county);
  }
  if (input.city) where.add("r.city ILIKE '%' || ? || '%'", input.city);
  if (input.postalCode) where.add("r.postal_code = ?", input.postalCode);
  if (input.industry) {
    where.values.push(input.industry);
    const position = where.values.length;
    where.clauses.push(`(r.industry_slug=$${position} OR r.industry_label ILIKE '%' || $${position} || '%')`);
  }
  if (input.sourceFamily) where.add("r.source_family = ?", input.sourceFamily);
  if (input.confidence === "confirmed") where.clauses.push("r.band='confirmed'");
  if (input.confidence === "strong") where.clauses.push("r.band='strong'");
  if (input.confidence === "moderate") where.clauses.push("r.band='moderate'");
  if (input.confidence === "early") where.clauses.push("r.band IN ('early','observed')");
  return where;
}

const RECORDS_CTE = `WITH records AS (
  SELECT 'outcome:' || o.id::text AS record_id,
   CASE o.outcome_type
    WHEN 'business_formed' THEN 'new-businesses'
    WHEN 'establishment_opened' THEN 'opening'
    WHEN 'establishment_expanded' THEN 'growing'
    WHEN 'establishment_relocated' THEN 'moving'
    WHEN 'establishment_contracted' THEN 'shrinking'
    WHEN 'establishment_closed' THEN 'closing'
    WHEN 'business_dissolved' THEN 'closing' END AS category,
   'outcome'::text AS layer,COALESCE(be.establishment_name,c.canonical_name,'Business') AS business_name,
   o.outcome_type AS what_changed,'confirmed'::text AS record_status,'confirmed'::text AS band,
   NULL::numeric AS score,1::numeric AS confidence,o.outcome_date AS record_date,o.first_observed_at,
   o.country_code,o.state_code,NULL::text AS county,o.county_fips,o.city,o.postal_code,
   be.latitude,be.longitude,COALESCE(be.location_precision,'unknown') AS location_precision,
   COALESCE(sc.signal_family,'economic_development') AS source_family,o.source_system,o.source_url,
   jsonb_build_array(jsonb_build_object('source_system',o.source_system,'source_url',o.source_url,'label','Official outcome evidence')) AS sources,
   o.evidence,CASE WHEN o.origin_country IS NOT NULL OR o.origin_state IS NOT NULL OR o.origin_city IS NOT NULL
     THEN jsonb_build_object('country_code',o.origin_country,'state_code',o.origin_state,'county_fips',o.origin_county_fips,'city',o.origin_city) END AS origin,
   CASE WHEN o.destination_country IS NOT NULL OR o.destination_state IS NOT NULL OR o.destination_city IS NOT NULL
     THEN jsonb_build_object('country_code',o.destination_country,'state_code',o.destination_state,'county_fips',o.destination_county_fips,'city',o.destination_city) END AS destination,
   c.slug AS company_slug,be.id::text AS establishment_id,i.slug AS industry_slug,i.name AS industry_label
  FROM business_change_outcomes o
  LEFT JOIN business_establishments be ON be.id=o.establishment_id
  LEFT JOIN companies c ON c.id=COALESCE(o.company_id,be.company_id)
  LEFT JOIN industries i ON i.id=c.primary_industry_id
  LEFT JOIN business_change_source_coverage sc ON sc.source_system=o.source_system

  UNION ALL
  SELECT 'event:' || e.id::text,
   CASE WHEN e.event_type IN ('location_planned','location_opening','location_opened','market_entry') THEN 'opening'
    WHEN e.event_type IN ('location_expansion','workforce_expansion','company_growth','facility_acquisition') THEN 'growing'
    WHEN e.event_type IN ('relocation_planned','relocation_completed') THEN 'moving'
    WHEN e.event_type IN ('closure_announced','location_closed','facility_disposition') THEN 'closing'
    WHEN e.event_type IN ('workforce_contraction','location_contraction') THEN 'shrinking'
    WHEN e.event_type='business_formed' THEN 'new-businesses' END,
   'event',e.observed_business_name,e.event_type,e.event_status,
   CASE WHEN e.event_status IN ('opened','completed','closed') AND e.verification_status IN ('source_verified','corroborated')
     THEN 'confirmed' ELSE 'observed' END,e.confidence, e.confidence,
   COALESCE(e.effective_date,e.announced_date,e.first_observed_at::date),e.first_observed_at,
   COALESCE(e.destination_country,e.origin_country,be.country_code),
   COALESCE(e.destination_state,e.origin_state,be.state_code),be.county,
   COALESCE(e.destination_county_fips,e.origin_county_fips,be.county_fips),
   COALESCE(e.destination_city,e.origin_city,be.city),be.postal_code,be.latitude,be.longitude,e.location_precision,
   COALESCE(sc.signal_family,'economic_development'),e.source_system,e.source_url,
   jsonb_build_array(jsonb_build_object('source_system',e.source_system,'source_url',e.source_url,'label','Official event evidence')),
   e.evidence,
   CASE WHEN e.origin_country IS NOT NULL OR e.origin_state IS NOT NULL OR e.origin_city IS NOT NULL
     THEN jsonb_build_object('country_code',e.origin_country,'state_code',e.origin_state,'county_fips',e.origin_county_fips,'city',e.origin_city) END,
   CASE WHEN e.destination_country IS NOT NULL OR e.destination_state IS NOT NULL OR e.destination_city IS NOT NULL
     THEN jsonb_build_object('country_code',e.destination_country,'state_code',e.destination_state,'county_fips',e.destination_county_fips,'city',e.destination_city) END,
   c.slug,be.id::text,i.slug,i.name
  FROM establishment_events e
  LEFT JOIN business_establishments be ON be.id=e.establishment_id
  LEFT JOIN companies c ON c.id=COALESCE(e.company_id,be.company_id)
  LEFT JOIN industries i ON i.id=c.primary_industry_id
  LEFT JOIN business_change_source_coverage sc ON sc.source_system=e.source_system
  WHERE NOT EXISTS (SELECT 1 FROM business_change_outcomes o WHERE o.establishment_event_id=e.id)

  UNION ALL
  SELECT 'legacy-event:' || e.id::text,
   CASE WHEN e.event_type IN ('new_facility','opening','market_entry') THEN 'opening'
    WHEN e.event_type IN ('expansion','facility_expansion','hiring','investment') THEN 'growing'
    WHEN e.event_type IN ('relocation','headquarters_move') THEN 'moving'
    WHEN e.event_type='closure' THEN 'closing'
    WHEN e.event_type IN ('layoff','furlough','contraction','bankruptcy','restructuring','consolidation') THEN 'shrinking' END,
   'event',COALESCE(company.canonical_name,company.observed_company_name,e.title),e.event_type,e.event_status,
   'observed',e.confidence,e.confidence,
   COALESCE(e.effective_start_date,e.announced_date,e.first_observed_at::date),e.first_observed_at,
   COALESCE(e.source_country,'US'),e.primary_state,e.primary_county,e.primary_county_fips,e.primary_city,e.primary_postal_code,
   NULL::numeric,NULL::numeric,CASE WHEN e.primary_postal_code IS NOT NULL THEN 'postal_code'
     WHEN e.primary_city IS NOT NULL THEN 'city' WHEN e.primary_county_fips IS NOT NULL THEN 'county'
     WHEN e.primary_state IS NOT NULL THEN 'state' ELSE 'unknown' END,
   COALESCE(sc.signal_family,CASE WHEN e.source_system IN ('maryland_warn','virginia_warn') THEN 'workforce' ELSE 'economic_development' END),
   e.source_system,source.original_url,source.sources,COALESCE(e.evidence,'{}'::jsonb),NULL::jsonb,NULL::jsonb,
   company.slug,NULL::text,company.industry_slug,company.industry_label
  FROM company_events e
  LEFT JOIN LATERAL (
    SELECT ec.observed_company_name,
      CASE WHEN ec.review_status IN ('auto_verified','approved') THEN c.canonical_name END AS canonical_name,
      CASE WHEN ec.review_status IN ('auto_verified','approved') THEN c.slug END AS slug,
      CASE WHEN ec.review_status IN ('auto_verified','approved') THEN i.slug END AS industry_slug,
      CASE WHEN ec.review_status IN ('auto_verified','approved') THEN i.name END AS industry_label
    FROM company_event_companies ec JOIN companies c ON c.id=ec.company_id
    LEFT JOIN industries i ON i.id=c.primary_industry_id
    WHERE ec.event_id=e.id AND ec.review_status<>'rejected'
    ORDER BY (ec.review_status IN ('auto_verified','approved')) DESC,ec.is_primary DESC,ec.matching_confidence DESC LIMIT 1
  ) company ON true
  LEFT JOIN LATERAL (
    SELECT (array_agg(s.original_url ORDER BY s.is_primary DESC,s.collected_at DESC))[1] AS original_url,
      jsonb_agg(jsonb_build_object('source_system',s.source_system,'source_url',s.original_url,'label',s.publisher)
        ORDER BY s.is_primary DESC,s.collected_at DESC) AS sources
    FROM company_event_sources s WHERE s.event_id=e.id
  ) source ON true
  LEFT JOIN business_change_source_coverage sc ON sc.source_system=e.source_system
  WHERE e.verification_status<>'rejected' AND e.event_type IN (
    'new_facility','opening','market_entry','expansion','facility_expansion','hiring','investment',
    'relocation','headquarters_move','closure','layoff','furlough','contraction','bankruptcy','restructuring','consolidation'
  )

  UNION ALL
  SELECT 'registration:' || r.id::text,'new-businesses','registration',COALESCE(r.trade_name,r.legal_name),
   'business_formed',COALESCE(r.status,'official registration'),'observed',NULL::numeric,0.90::numeric,
   COALESCE(r.formation_date,r.registration_date,r.observed_at::date),r.first_observed_at,r.country_code,r.state_code,
   r.county,r.county_fips,r.city,r.postal_code,NULL::numeric,NULL::numeric,
   CASE WHEN r.postal_code IS NOT NULL THEN 'postal_code' WHEN r.city IS NOT NULL THEN 'city'
    WHEN r.county_fips IS NOT NULL THEN 'county' WHEN r.state_code IS NOT NULL THEN 'state' ELSE 'unknown' END,
   'registration',r.source_system,r.source_url,
   jsonb_build_array(jsonb_build_object('source_system',r.source_system,'source_url',r.source_url,'label','Official registration')),
   r.resolution_evidence,NULL::jsonb,NULL::jsonb,c.slug,NULL::text,COALESCE(i.slug,r.industry_code),COALESCE(i.name,r.industry_label)
  FROM business_registrations r LEFT JOIN companies c ON c.id=r.company_id
  LEFT JOIN industries i ON i.id=c.primary_industry_id
  WHERE r.resolution_status<>'rejected' AND NOT EXISTS (
    SELECT 1 FROM business_change_outcomes o WHERE o.business_registration_id=r.id
  )

  UNION ALL
  SELECT 'assessment:' || a.id::text,
   CASE a.assessment_type WHEN 'opening' THEN 'opening' WHEN 'growth' THEN 'growing'
    WHEN 'relocation' THEN 'moving' WHEN 'closing' THEN 'closing' WHEN 'contraction' THEN 'shrinking' END,
   'indication',COALESCE(be.establishment_name,c.canonical_name,'Location activity'),a.assessment_type || '_indication',
   a.band,a.band,a.score,a.score/100,a.as_of_date,a.generated_at,a.country_code,a.state_code,be.county,a.county_fips,
   a.city,a.postal_code,be.latitude,be.longitude,COALESCE(be.location_precision,
     CASE WHEN a.postal_code IS NOT NULL THEN 'postal_code' WHEN a.city IS NOT NULL THEN 'city'
       WHEN a.county_fips IS NOT NULL THEN 'county' WHEN a.state_code IS NOT NULL THEN 'state' ELSE 'unknown' END),
   NULL::text,NULL::text,(a.components->'items'->0->>'source_url'),COALESCE(a.components->'items','[]'::jsonb),
   a.components,a.components->'origin',a.components->'destination',c.slug,be.id::text,i.slug,i.name
  FROM business_change_assessments a
  LEFT JOIN business_establishments be ON be.id=a.establishment_id
  LEFT JOIN companies c ON c.id=COALESCE(a.company_id,be.company_id)
  LEFT JOIN industries i ON i.id=c.primary_industry_id
  WHERE a.assessment_type IN ('opening','growth','relocation','closing','contraction')
)`;

export async function searchBusinessChange(input: BusinessChangeInput) {
  const baseWhere = filters(input);
  const rowWhere = baseWhere.clone();
  rowWhere.add("r.category = ?", input.tab);
  const countValues = [...baseWhere.values];
  const rowValues = [...rowWhere.values, input.pageSize, (input.page - 1) * input.pageSize];
  const limitPosition = rowValues.length - 1;
  const offsetPosition = rowValues.length;
  const [counts, total, rows] = await Promise.all([
    query<{ category: BusinessChangeTab; count: string }>(
      `${RECORDS_CTE} SELECT r.category,count(*)::text AS count FROM records r ${baseWhere.text()}
       GROUP BY r.category ORDER BY r.category`,
      countValues,
    ),
    query<{ count: string }>(
      `${RECORDS_CTE} SELECT count(*)::text AS count FROM records r ${rowWhere.text()}`,
      rowWhere.values,
    ),
    query<BusinessChangeRow>(
      `${RECORDS_CTE} SELECT * FROM records r ${rowWhere.text()}
       ORDER BY r.record_date DESC,r.first_observed_at DESC,r.business_name
       LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      rowValues,
    ),
  ]);
  const categoryCounts = Object.fromEntries(BUSINESS_CHANGE_TABS.map((tab) => [tab, 0])) as Record<BusinessChangeTab, number>;
  counts.forEach((row) => { categoryCounts[row.category] = Number(row.count); });
  return {
    rows,
    counts: categoryCounts,
    total: Number(total[0]?.count || 0),
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function getBusinessChangeCoverage(): Promise<BusinessChangeCoverageRow[]> {
  return query<BusinessChangeCoverageRow>(
    `SELECT signal_family,source_system,source_name,country_code,state_code,county_fips,coverage_status,
     reuse_status,update_frequency,official_url,limitations,fields_available
     FROM business_change_source_coverage
     ORDER BY CASE coverage_status WHEN 'available' THEN 1 WHEN 'partial' THEN 2 WHEN 'planned' THEN 3 ELSE 4 END,
     signal_family,country_code,state_code NULLS FIRST,source_name`,
  );
}

export async function getEstablishmentProfile(id: string) {
  const establishments = await query<Record<string, unknown> & { company_id: string | null }>(
    `SELECT be.*,be.id::text,c.slug AS company_slug,c.canonical_name,i.name AS industry_name
     FROM business_establishments be LEFT JOIN companies c ON c.id=be.company_id
     LEFT JOIN industries i ON i.id=c.primary_industry_id WHERE be.id=$1`,
    [id],
  );
  const establishment = establishments[0];
  if (!establishment) return null;
  const [events, signals, assessments, outcomes, addresses, licenses] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT id::text,event_type,event_status,announced_date::text,effective_date::text,jobs_created,jobs_lost,
       jobs_affected,square_feet::text,capital_investment::text,currency,source_system,source_url,
       verification_status,confidence::text,evidence,first_observed_at::text
       FROM establishment_events WHERE establishment_id=$1 OR origin_establishment_id=$1 OR destination_establishment_id=$1
       ORDER BY COALESCE(effective_date,announced_date) DESC NULLS LAST`, [id],
    ),
    query<Record<string, unknown>>(
      `SELECT signal_type,signal_family,direction,observed_at::text,effective_date::text,strength::text,
       reliability::text,confidence::text,source_system,source_url,evidence
       FROM business_change_signals WHERE establishment_id=$1 ORDER BY observed_at DESC LIMIT 100`, [id],
    ),
    query<Record<string, unknown>>(
      `SELECT DISTINCT ON (assessment_type) assessment_type,as_of_date::text,score::text,band,evidence_quality,
       data_sufficiency,model_version,components,explanation FROM business_change_assessments
       WHERE establishment_id=$1 ORDER BY assessment_type,as_of_date DESC,generated_at DESC`, [id],
    ),
    query<Record<string, unknown>>(
      `SELECT outcome_type,outcome_date::text,announcement_date::text,source_system,source_url,
       verification_status,lead_time_days,evidence FROM business_change_outcomes
       WHERE establishment_id=$1 OR origin_establishment_id=$1 OR destination_establishment_id=$1
       ORDER BY outcome_date DESC`, [id],
    ),
    query<Record<string, unknown>>(
      `SELECT address_line,city,county,state_code,postal_code,country_code,location_precision,valid_from::text,
       valid_to::text,source_system,source_url,first_observed_at::text,last_observed_at::text
       FROM establishment_address_history WHERE establishment_id=$1 ORDER BY valid_from DESC NULLS LAST,first_observed_at DESC`, [id],
    ),
    query<Record<string, unknown>>(
      `SELECT source_license_id,legal_name,trade_name,license_type,business_activity,category,license_status,
       initial_issue_date::text,start_date::text,end_date::text,source_system,source_url,observed_at::text
       FROM business_licenses WHERE establishment_id=$1 ORDER BY observed_at DESC`, [id],
    ),
  ]);
  return { establishment, events, signals, assessments, outcomes, addresses, licenses };
}

export async function getCompanyEstablishmentIntelligence(companyId: string) {
  const [establishments, recentChanges] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT id::text,establishment_name,establishment_type,address_line,city,county,state_code,postal_code,
       country_code,location_status,location_precision,verified_headquarters,verification_status,confidence::text,
       source_url,last_observed_at::text FROM business_establishments WHERE company_id=$1
       ORDER BY verified_headquarters DESC,last_observed_at DESC`, [companyId],
    ),
    query<Record<string, unknown>>(
      `SELECT 'outcome' AS layer,outcome_type AS change_type,outcome_date::text AS change_date,source_system,source_url,
       verification_status,NULL::text AS band,NULL::text AS score,establishment_id::text
       FROM business_change_outcomes WHERE company_id=$1
       UNION ALL SELECT 'indication',assessment_type,as_of_date::text,NULL,NULL,evidence_quality,band,score::text,establishment_id::text
       FROM business_change_assessments WHERE company_id=$1
       ORDER BY change_date DESC LIMIT 50`, [companyId],
    ),
  ]);
  return { establishments, recentChanges };
}
