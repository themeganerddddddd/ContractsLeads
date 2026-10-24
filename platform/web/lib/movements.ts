import "server-only";

import { query } from "@/lib/db";

export type MovementInput = {
  q?: string;
  eventType?: string;
  eventStatus?: string;
  industry?: string;
  state?: string;
  county?: string;
  city?: string;
  source?: string;
  sourceType?: string;
  verificationStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  minJobs?: number;
  minInvestment?: number;
  page: number;
  pageSize: number;
  sort: "newest" | "jobs" | "investment";
};

export type RawMovementParams = Record<
  string,
  string | string[] | undefined
>;

export type MovementRow = {
  id: string;
  announced_date?: string | null;
  effective_start_date?: string | null;
  title: string;
  event_type: string;
  event_status: string;
  verification_status?: string | null;
  jobs_created?: string | number | null;
  jobs_affected?: string | number | null;
  capital_investment?: string | number | null;
  currency?: string | null;
  primary_city?: string | null;
  primary_county?: string | null;
  primary_county_fips?: string | null;
  primary_state?: string | null;
  slug?: string | null;
  canonical_name?: string | null;
  review_status?: string | null;
  original_url?: string | null;
  publisher?: string | null;
};

export type CoverageRow = {
  source_system: string;
  event_type: string;
  country_code: string;
  state_code?: string | null;
  coverage_start?: string | null;
  coverage_status: string;
  official_url: string;
  known_limitations: string;
  name: string;
  last_success_at?: string | null;
  quality_status: string;
};

type MovementMetrics = {
  events: string;
  growth_events: string;
  contraction_events: string;
  announced_jobs: string;
  affected_jobs: string;
};

const EVENT_TYPES = new Set([
  "layoff",
  "closure",
  "furlough",
  "expansion",
  "relocation",
  "headquarters_move",
  "new_facility",
  "facility_expansion",
  "hiring",
  "investment",
  "permit",
  "lease",
  "executive_change",
  "regulatory_disclosure",
  "other",
  "funding",
  "market_entry",
  "bankruptcy",
  "restructuring",
  "consolidation",
  "opening",
  "contraction",
]);

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value || undefined;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

export function parseMovementInput(params: RawMovementParams): MovementInput {
  const eventType = one(params.event_type);
  const sort = one(params.sort);
  const minJobs = one(params.min_jobs);
  const minInvestment = one(params.min_investment);
  return {
    q: one(params.q),
    eventType: eventType && EVENT_TYPES.has(eventType) ? eventType : undefined,
    eventStatus: one(params.event_status),
    industry: one(params.industry),
    state: one(params.state)?.toUpperCase(),
    county: one(params.county),
    city: one(params.city),
    source: one(params.source),
    sourceType: one(params.source_type),
    verificationStatus: one(params.verification_status),
    dateFrom: one(params.date_from),
    dateTo: one(params.date_to),
    minJobs: minJobs && Number.isFinite(Number(minJobs)) ? Number(minJobs) : undefined,
    minInvestment:
      minInvestment && Number.isFinite(Number(minInvestment))
        ? Number(minInvestment)
        : undefined,
    page: positiveInteger(one(params.page), 1),
    pageSize: Math.min(100, positiveInteger(one(params.page_size), 25)),
    sort: sort === "jobs" || sort === "investment" ? sort : "newest",
  };
}

class SqlWhere {
  clauses = ["e.verification_status <> 'rejected'"];
  values: unknown[] = [];

  add(clause: string, value: unknown): void {
    this.values.push(value);
    this.clauses.push(clause.replace("?", `$${this.values.length}`));
  }

  text(): string {
    return `WHERE ${this.clauses.join(" AND ")}`;
  }
}

function movementWhere(input: MovementInput): SqlWhere {
  const where = new SqlWhere();
  if (input.q) {
    where.values.push(input.q);
    const position = where.values.length;
    where.clauses.push(
      `(to_tsvector('english',coalesce(e.title,'') || ' ' || coalesce(e.summary,'')) @@ plainto_tsquery('english',$${position})
       OR company.canonical_name ILIKE '%' || $${position} || '%')`,
    );
  }
  if (input.eventType === "contraction")
    where.clauses.push("e.event_type IN ('layoff','closure','furlough','bankruptcy','restructuring')");
  else if (input.eventType) where.add("e.event_type = ?", input.eventType);
  if (input.eventStatus) where.add("e.event_status = ?", input.eventStatus);
  if (input.industry) where.add("company.industry_slug = ?", input.industry);
  if (input.state) where.add("e.primary_state = ?", input.state);
  if (input.county) {
    if (/^\d{5}$/.test(input.county))
      where.add("e.primary_county_fips = ?", input.county);
    else where.add("e.primary_county ILIKE ?", input.county);
  }
  if (input.city) where.add("e.primary_city ILIKE ?", input.city);
  if (input.source) where.add("e.source_system = ?", input.source);
  if (input.sourceType) where.add("source.source_type = ?", input.sourceType);
  if (input.verificationStatus)
    where.add("e.verification_status = ?", input.verificationStatus);
  if (input.dateFrom)
    where.add("COALESCE(e.effective_start_date,e.announced_date) >= ?::date", input.dateFrom);
  if (input.dateTo)
    where.add("COALESCE(e.effective_start_date,e.announced_date) <= ?::date", input.dateTo);
  if (input.minJobs !== undefined)
    where.add("COALESCE(e.jobs_created,e.jobs_affected,0) >= ?", input.minJobs);
  if (input.minInvestment !== undefined)
    where.add("COALESCE(e.capital_investment,0) >= ?", input.minInvestment);
  return where;
}

const MOVEMENT_JOINS = `
  LEFT JOIN LATERAL (
    SELECT c.id::text AS company_id,c.slug,c.canonical_name,ec.matching_confidence,ec.review_status,
    i.slug AS industry_slug,i.name AS industry_name
    FROM company_event_companies ec JOIN companies c ON c.id=ec.company_id
    LEFT JOIN industries i ON i.id=c.primary_industry_id
    WHERE ec.event_id=e.id ORDER BY ec.is_primary DESC,ec.matching_confidence DESC LIMIT 1
  ) company ON true
  LEFT JOIN LATERAL (
    SELECT s.original_url,s.publisher,s.publication_date::text,s.commercial_use_status,s.source_type
    FROM company_event_sources s WHERE s.event_id=e.id
    ORDER BY s.is_primary DESC,s.collected_at DESC LIMIT 1
  ) source ON true`;

export async function searchMovements(input: MovementInput) {
  const countWhere = movementWhere(input);
  const rowWhere = movementWhere(input);
  const order =
    input.sort === "jobs"
      ? "COALESCE(e.jobs_created,e.jobs_affected) DESC NULLS LAST"
      : input.sort === "investment"
        ? "e.capital_investment DESC NULLS LAST"
        : "COALESCE(e.effective_start_date,e.announced_date) DESC NULLS LAST";
  const offset = (input.page - 1) * input.pageSize;
  rowWhere.values.push(input.pageSize, offset);
  const limitPosition = rowWhere.values.length - 1;
  const offsetPosition = rowWhere.values.length;
  const [counts, rows, metrics, coverage, sources, industries, sourceTypes] = await Promise.all([
    query<{ count: string }>(
      `SELECT count(*)::text AS count FROM company_events e ${MOVEMENT_JOINS} ${countWhere.text()}`,
      countWhere.values,
    ),
    query<MovementRow>(
      `SELECT e.id::text,e.event_type,e.event_subtype,e.event_status,e.verification_status,
       e.announced_date::text,e.effective_start_date::text,e.effective_end_date::text,e.title,e.summary,
       e.jobs_created,e.jobs_affected,e.employment_change,e.capital_investment::text,e.currency,
       e.primary_state,e.primary_county,e.primary_county_fips,e.primary_city,e.primary_postal_code,
       e.confidence::text,e.source_system,company.*,source.*
       FROM company_events e ${MOVEMENT_JOINS} ${rowWhere.text()}
       ORDER BY ${order},e.title LIMIT $${limitPosition} OFFSET $${offsetPosition}`,
      rowWhere.values,
    ),
    query<MovementMetrics>(
      `SELECT count(*)::text AS events,
       count(*) FILTER (WHERE event_type IN ('expansion','facility_expansion','new_facility','headquarters_move','hiring','investment'))::text AS growth_events,
       count(*) FILTER (WHERE event_type IN ('layoff','closure','furlough'))::text AS contraction_events,
       COALESCE(sum(jobs_created),0)::text AS announced_jobs,
       COALESCE(sum(jobs_affected),0)::text AS affected_jobs
       FROM company_events WHERE verification_status <> 'rejected'`,
    ),
    getMovementCoverage(),
    query<{ source_system: string; name: string }>(
      `SELECT source_system,name FROM data_sources
       WHERE source_system IN (SELECT DISTINCT source_system FROM geographic_source_coverage)
       ORDER BY name`,
    ),
    query<{ slug: string; name: string }>(
      `SELECT DISTINCT i.slug,i.name FROM company_event_companies ec
       JOIN companies c ON c.id=ec.company_id JOIN industries i ON i.id=c.primary_industry_id
       ORDER BY i.name`,
    ),
    query<{ source_type: string }>(
      `SELECT DISTINCT source_type FROM company_event_sources ORDER BY source_type`,
    ),
  ]);
  return {
    rows,
    total: Number(counts[0]?.count || 0),
    page: input.page,
    pageSize: input.pageSize,
    metrics: metrics[0],
    coverage,
    sources,
    industries,
    sourceTypes: sourceTypes.map((row) => row.source_type),
  };
}

export async function getMovementCoverage() {
  return query<CoverageRow>(
    `SELECT g.source_system,g.event_type,g.country_code,g.state_code,g.county_fips,
     g.coverage_start::text,g.coverage_end::text,g.update_frequency,g.coverage_status,
     g.official_url,g.known_limitations,g.metadata,d.name,d.last_success_at::text,d.quality_status
     FROM geographic_source_coverage g JOIN data_sources d ON d.source_system=g.source_system
     ORDER BY g.country_code,g.state_code,g.event_type,d.name`,
  );
}

export async function getCompanyMovements(companyId: string) {
  return query<MovementRow>(
    `SELECT e.id::text,e.event_type,e.event_subtype,e.event_status,e.verification_status,
     e.announced_date::text,e.effective_start_date::text,e.effective_end_date::text,e.title,e.summary,
     e.jobs_created,e.jobs_affected,e.employment_change,e.capital_investment::text,e.currency,
     e.primary_state,e.primary_county,e.primary_county_fips,e.primary_city,e.confidence::text,
     ec.matching_method,ec.matching_confidence::text,ec.review_status,
     source.original_url,source.publisher,source.publication_date
     FROM company_event_companies ec JOIN company_events e ON e.id=ec.event_id
     LEFT JOIN LATERAL (
       SELECT original_url,publisher,publication_date::text FROM company_event_sources
       WHERE event_id=e.id ORDER BY is_primary DESC,collected_at DESC LIMIT 1
     ) source ON true
     WHERE ec.company_id=$1 AND e.verification_status <> 'rejected'
     ORDER BY COALESCE(e.effective_start_date,e.announced_date) DESC NULLS LAST`,
    [companyId],
  );
}

export async function getLocationMovements(state: string, countyFips: string) {
  const stateCode = state.toUpperCase();
  const [metrics, rows] = await Promise.all([
    query<MovementMetrics>(
      `SELECT count(*)::text AS events,
       count(*) FILTER (WHERE event_type IN ('expansion','facility_expansion','new_facility','headquarters_move','hiring','investment'))::text AS growth_events,
       count(*) FILTER (WHERE event_type IN ('layoff','closure','furlough'))::text AS contraction_events,
       COALESCE(sum(jobs_created),0)::text AS announced_jobs,
       COALESCE(sum(jobs_affected),0)::text AS affected_jobs
       FROM company_events WHERE primary_state=$1 AND primary_county_fips=$2 AND verification_status <> 'rejected'`,
      [stateCode, countyFips],
    ),
    query<MovementRow>(
      `SELECT e.id::text,e.event_type,e.event_status,e.verification_status,e.announced_date::text,e.effective_start_date::text,
       e.title,e.summary,e.jobs_created,e.jobs_affected,e.capital_investment::text,e.currency,
       e.primary_state,e.primary_county,e.primary_county_fips,e.primary_city,
       company.slug,company.canonical_name,company.review_status,source.original_url,source.publisher
       FROM company_events e
       LEFT JOIN LATERAL (
         SELECT c.slug,c.canonical_name,ec.review_status FROM company_event_companies ec JOIN companies c ON c.id=ec.company_id
         WHERE ec.event_id=e.id ORDER BY ec.is_primary DESC,ec.matching_confidence DESC LIMIT 1
       ) company ON true
       LEFT JOIN LATERAL (
         SELECT original_url,publisher FROM company_event_sources WHERE event_id=e.id
         ORDER BY is_primary DESC,collected_at DESC LIMIT 1
       ) source ON true
       WHERE e.primary_state=$1 AND e.primary_county_fips=$2 AND e.verification_status <> 'rejected'
       ORDER BY COALESCE(e.effective_start_date,e.announced_date) DESC NULLS LAST LIMIT 50`,
      [stateCode, countyFips],
    ),
  ]);
  return { metrics: metrics[0], rows };
}
