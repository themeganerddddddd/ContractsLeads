import "server-only";

import { query } from "@/lib/db";

export type IndicatorInput = {
  state?: string;
  county?: string;
  city?: string;
  classification?: string;
  minValue?: number;
  page: number;
  pageSize: number;
};

type RawParams = Record<string, string | string[] | undefined>;

export type PermitRow = {
  id: string;
  issue_date?: string | null;
  application_date?: string | null;
  status?: string | null;
  permit_number: string;
  work_type?: string | null;
  description?: string | null;
  use_code?: string | null;
  address_line?: string | null;
  city?: string | null;
  state_code?: string | null;
  postal_code?: string | null;
  county_fips?: string | null;
  project_value?: string | number | null;
  relevance_classification: string;
  relevance_score: string | number;
  source_url: string;
};

export type MovementAssessment = {
  assessment_type: string;
  state_code?: string | null;
  county_fips?: string | null;
  score?: string | number | null;
  explanation: string;
  as_of_date: string;
  model_version: string;
  evidence_quality: string;
};

export type MovementIndicator = {
  id: string;
  indicator_type: string;
  event_title?: string | null;
  observed_at: string;
  original_url?: string | null;
};

export type EarlyIndicatorData = {
  assessments: MovementAssessment[];
  indicators: MovementIndicator[];
};

type PermitMetrics = {
  permits: string;
  project_value: string;
  new_construction: string;
  high_value: string;
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value || undefined;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function parseIndicatorInput(params: RawParams): IndicatorInput {
  const minValue = one(params.min_value);
  return {
    state: one(params.state)?.toUpperCase(),
    county: one(params.county),
    city: one(params.city),
    classification: one(params.classification),
    minValue: minValue && Number.isFinite(Number(minValue)) ? Number(minValue) : undefined,
    page: positiveInteger(one(params.page), 1),
    pageSize: Math.min(100, positiveInteger(one(params.page_size), 25)),
  };
}

export async function searchPermitIndicators(input: IndicatorInput) {
  const clauses = ["relevance_classification <> 'not_relevant'"];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replace("?", `$${values.length}`));
  };
  if (input.state) add("state_code=?", input.state);
  if (input.county) {
    if (/^\d{5}$/.test(input.county)) add("county_fips=?", input.county);
    else add("county ILIKE ?", input.county);
  }
  if (input.city) add("city ILIKE ?", input.city);
  if (input.classification) add("relevance_classification=?", input.classification);
  if (input.minValue !== undefined) add("COALESCE(project_value,0)>=?", input.minValue);
  const where = `WHERE ${clauses.join(" AND ")}`;
  const countValues = [...values];
  const offset = (input.page - 1) * input.pageSize;
  values.push(input.pageSize, offset);
  const [counts, rows, metrics, classifications] = await Promise.all([
    query<{ count: string }>(`SELECT count(*)::text AS count FROM development_permits ${where}`, countValues),
    query<PermitRow>(
      `SELECT id::text,permit_number,jurisdiction,address_line,city,county,county_fips,state_code,postal_code,
       permit_type,work_type,use_code,description,application_date::text,issue_date::text,final_date::text,status,
       project_value::text,currency,building_area::text,relevance_score::text,relevance_classification,
       applicant,contractor,developer,property_owner,verified_occupant,source_url,last_observed_at::text
       FROM development_permits ${where}
       ORDER BY COALESCE(issue_date,application_date) DESC NULLS LAST,permit_number
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    ),
    query<PermitMetrics>(
      `SELECT count(*)::text AS permits,COALESCE(sum(project_value),0)::text AS project_value,
       count(*) FILTER (WHERE relevance_classification='commercial_new_construction')::text AS new_construction,
       count(*) FILTER (WHERE relevance_classification='high_value_commercial')::text AS high_value
       FROM development_permits WHERE relevance_classification <> 'not_relevant'`,
    ),
    query<{ relevance_classification: string }>(
      `SELECT DISTINCT relevance_classification FROM development_permits
       WHERE relevance_classification <> 'not_relevant' ORDER BY relevance_classification`,
    ),
  ]);
  return {
    total: Number(counts[0]?.count || 0),
    rows,
    metrics: metrics[0],
    classifications: classifications.map((row) => row.relevance_classification),
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function getCompanyEarlyIndicators(companyId: string) {
  const [assessments, indicators] = await Promise.all([
    query<MovementAssessment>(
      `SELECT DISTINCT ON (assessment_type,country_code,state_code,county_fips,city)
       assessment_type,as_of_date::text,prediction_horizon_days,country_code,state_code,county_fips,city,
       score::text,evidence_quality,data_sufficiency,model_version,components,explanation,generated_at::text
       FROM movement_assessments WHERE company_id=$1
       ORDER BY assessment_type,country_code,state_code,county_fips,city,as_of_date DESC,generated_at DESC`,
      [companyId],
    ),
    query<MovementIndicator>(
      `SELECT mi.id::text,mi.as_of_date::text,mi.observed_at::text,mi.indicator_type,mi.direction,
       mi.value::text,mi.country_code,mi.state_code,mi.county_fips,mi.city,mi.strength::text,
       mi.reliability::text,mi.confidence::text,mi.evidence,e.title AS event_title,
       source.original_url,source.publisher
       FROM movement_indicators mi LEFT JOIN company_events e ON e.id=mi.event_id
       LEFT JOIN LATERAL (
         SELECT original_url,publisher FROM company_event_sources WHERE event_id=e.id
         ORDER BY is_primary DESC,collected_at DESC LIMIT 1
       ) source ON true
       WHERE mi.company_id=$1 ORDER BY mi.observed_at DESC LIMIT 50`,
      [companyId],
    ),
  ]);
  return { assessments, indicators };
}
