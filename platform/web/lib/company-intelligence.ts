import "server-only";

import { query } from "@/lib/db";
import { searchResultLimit, type Plan } from "@/lib/entitlements";
import type { CompanyScreenerInput, CompanySort, PredictionInput } from "@/lib/company-screener-input";

export { parseCompanyScreenerInput, parsePredictionInput } from "@/lib/company-screener-input";
export type { CompanyScreenerInput, CompanySort, PredictionInput } from "@/lib/company-screener-input";

export type CompanySnapshotRow = {
  id: string;
  slug: string;
  canonical_name: string;
  legal_name: string;
  parent_company_name: string | null;
  industry_name: string | null;
  industry_slug: string | null;
  country_code: string | null;
  location_city: string | null;
  location_county: string | null;
  location_state: string | null;
  location_postal: string | null;
  location_label: string | null;
  location_basis: string;
  government_business: string | null;
  obligations_12m: string | null;
  known_locations: string;
  latest_transaction_date: string | null;
  latest_transaction_obligation: string | null;
  latest_transaction_material: boolean | null;
  latest_change_type: string | null;
  latest_change_date: string | null;
  latest_change_score: string | null;
  latest_change_sufficiency: string | null;
  latest_change_components: Record<string, unknown> | null;
  latest_change_explanation: string | null;
  expansion_score: string | null;
  expansion_date: string | null;
  expansion_sufficiency: string | null;
  expansion_components: Record<string, unknown> | null;
  expansion_explanation: string | null;
  relocation_score: string | null;
  relocation_date: string | null;
  relocation_sufficiency: string | null;
  relocation_components: Record<string, unknown> | null;
  relocation_explanation: string | null;
  contraction_score: string | null;
  contraction_date: string | null;
  contraction_sufficiency: string | null;
  contraction_components: Record<string, unknown> | null;
  contraction_explanation: string | null;
  watched: boolean;
  full_count?: string;
};

export type CompanyScreenerResult = {
  rows: CompanySnapshotRow[];
  total: number;
  visibleTotal: number;
  page: number;
  pageSize: number;
  resultLimited: boolean;
};

export type PredictionKind = "expansion" | "moves" | "contraction";


class SqlFilters {
  clauses: string[] = [];
  values: unknown[];

  constructor(userId: string | null) {
    this.values = [userId];
  }

  add(sql: string, value: unknown) {
    this.values.push(value);
    this.clauses.push(sql.replaceAll("?", `$${this.values.length}`));
  }

  text() {
    return this.clauses.length ? `WHERE ${this.clauses.join(" AND ")}` : "";
  }
}

const SNAPSHOT_CTES = `WITH transaction_activity AS MATERIALIZED (
  SELECT a.recipient_company_id AS company_id,
    sum(t.obligation) FILTER (WHERE t.obligation IS NOT NULL) AS government_business,
    sum(t.obligation) FILTER (
      WHERE t.obligation IS NOT NULL AND t.action_date >= current_date - interval '365 days'
    ) AS obligations_12m,
    bool_or(t.obligation > 0) AS has_positive_transaction
  FROM transactions t
  JOIN awards a ON a.id=t.award_id
  WHERE NOT t.is_demo AND NOT t.is_benchmark AND NOT a.is_demo AND NOT a.is_benchmark
  GROUP BY a.recipient_company_id
), latest_transaction AS MATERIALIZED (
  SELECT DISTINCT ON (a.recipient_company_id) a.recipient_company_id AS company_id,
    t.action_date,t.obligation,
    (abs(t.obligation) >= 1000000 OR (
      greatest(abs(COALESCE(a.current_value,0)),abs(COALESCE(a.potential_value,0)),abs(COALESCE(a.total_obligated,0))) > 0
      AND abs(t.obligation) >= greatest(abs(COALESCE(a.current_value,0)),abs(COALESCE(a.potential_value,0)),abs(COALESCE(a.total_obligated,0))) * 0.05
    )) AS is_material
  FROM transactions t
  JOIN awards a ON a.id=t.award_id
  WHERE NOT t.is_demo AND NOT t.is_benchmark AND NOT a.is_demo AND NOT a.is_benchmark
  ORDER BY a.recipient_company_id,t.action_date DESC NULLS LAST,t.created_at DESC
), award_activity AS MATERIALIZED (
  SELECT recipient_company_id AS company_id,
    bool_or(
      COALESCE(total_obligated,0) > 0 OR COALESCE(current_value,0) > 0 OR COALESCE(potential_value,0) > 0
    ) AS has_positive_award
  FROM awards
  WHERE NOT is_demo AND NOT is_benchmark
  GROUP BY recipient_company_id
), global_activity AS MATERIALIZED (
  SELECT ps.company_id,bool_or(COALESCE(p.value_native,0) > 0) AS has_positive_process
  FROM procurement_process_suppliers ps
  JOIN procurement_processes p ON p.id=ps.process_id
  WHERE NOT p.is_demo
  GROUP BY ps.company_id
), establishment_activity AS MATERIALIZED (
  SELECT company_id,count(*)::text AS known_locations,
    bool_or(verified_headquarters) AS has_verified_headquarters,
    bool_or(location_status IN ('opening','active','expanding','relocating')) AS has_operating_location,
    bool_or(location_status IN ('opening','planned')) AS has_opening,
    bool_or(location_status='closing') AS has_closing
  FROM business_establishments
  WHERE company_id IS NOT NULL
    AND match_status IN ('auto_verified','approved')
    AND verification_status IN ('source_verified','corroborated')
  GROUP BY company_id
), best_location AS MATERIALIZED (
  SELECT DISTINCT ON (company_id) company_id,city,county,state_code,postal_code,country_code,verified_headquarters,
    establishment_type,location_status
  FROM business_establishments
  WHERE company_id IS NOT NULL
    AND match_status IN ('auto_verified','approved')
    AND verification_status IN ('source_verified','corroborated')
  ORDER BY company_id,verified_headquarters DESC,
    CASE location_status WHEN 'active' THEN 0 WHEN 'expanding' THEN 1 WHEN 'opening' THEN 2 ELSE 3 END,
    last_observed_at DESC
), latest_assessments AS MATERIALIZED (
  SELECT DISTINCT ON (company_id,assessment_type) company_id,assessment_type,as_of_date,score,
    data_sufficiency,components,explanation
  FROM movement_assessments
  WHERE company_id IS NOT NULL AND model_version='company-change-indication-v2'
    AND assessment_type IN ('expansion','growth','relocation','contraction','closure_distress')
  ORDER BY company_id,assessment_type,as_of_date DESC,generated_at DESC
), assessment_summary AS MATERIALIZED (
  SELECT company_id,
    max(score) FILTER (WHERE assessment_type='expansion') AS expansion_score,
    max(as_of_date) FILTER (WHERE assessment_type='expansion') AS expansion_date,
    (array_agg(data_sufficiency ORDER BY as_of_date DESC) FILTER (WHERE assessment_type='expansion'))[1] AS expansion_sufficiency,
    (array_agg(components ORDER BY as_of_date DESC) FILTER (WHERE assessment_type='expansion'))[1] AS expansion_components,
    (array_agg(explanation ORDER BY as_of_date DESC) FILTER (WHERE assessment_type='expansion'))[1] AS expansion_explanation,
    max(score) FILTER (WHERE assessment_type='relocation') AS relocation_score,
    max(as_of_date) FILTER (WHERE assessment_type='relocation') AS relocation_date,
    (array_agg(data_sufficiency ORDER BY as_of_date DESC) FILTER (WHERE assessment_type='relocation'))[1] AS relocation_sufficiency,
    (array_agg(components ORDER BY as_of_date DESC) FILTER (WHERE assessment_type='relocation'))[1] AS relocation_components,
    (array_agg(explanation ORDER BY as_of_date DESC) FILTER (WHERE assessment_type='relocation'))[1] AS relocation_explanation,
    max(score) FILTER (WHERE assessment_type IN ('contraction','closure_distress')) AS contraction_score,
    max(as_of_date) FILTER (WHERE assessment_type IN ('contraction','closure_distress')) AS contraction_date,
    (array_agg(data_sufficiency ORDER BY as_of_date DESC) FILTER (WHERE assessment_type IN ('contraction','closure_distress')))[1] AS contraction_sufficiency,
    (array_agg(components ORDER BY as_of_date DESC) FILTER (WHERE assessment_type IN ('contraction','closure_distress')))[1] AS contraction_components,
    (array_agg(explanation ORDER BY as_of_date DESC) FILTER (WHERE assessment_type IN ('contraction','closure_distress')))[1] AS contraction_explanation
  FROM latest_assessments GROUP BY company_id
), latest_change AS MATERIALIZED (
  SELECT DISTINCT ON (company_id) company_id,assessment_type,as_of_date,score,data_sufficiency,components,explanation
  FROM latest_assessments
  ORDER BY company_id,as_of_date DESC,score DESC NULLS LAST
), supported_change AS MATERIALIZED (
  SELECT company_id,
    bool_or(outcome_type IN ('establishment_opened','business_formed')) AS has_opening,
    bool_or(outcome_type IN ('establishment_expanded')) AS has_expansion,
    bool_or(outcome_type='establishment_relocated') AS has_relocation,
    bool_or(outcome_type IN ('establishment_contracted','establishment_closed','business_dissolved')) AS has_contraction
  FROM business_change_outcomes WHERE company_id IS NOT NULL GROUP BY company_id
), supported_license AS MATERIALIZED (
  SELECT company_id,true AS has_license FROM business_licenses
  WHERE company_id IS NOT NULL AND resolution_status IN ('auto_verified','approved') GROUP BY company_id
), supported_registration AS MATERIALIZED (
  SELECT company_id,true AS has_registration FROM business_registrations
  WHERE company_id IS NOT NULL AND resolution_status IN ('auto_verified','approved') GROUP BY company_id
), company_snapshot AS MATERIALIZED (
  SELECT c.id::text,c.slug,c.canonical_name,c.legal_name,p.canonical_name AS parent_company_name,
    i.name AS industry_name,i.slug AS industry_slug,
    COALESCE(NULLIF(c.legal_entity_country,''),
      CASE WHEN c.recipient_country='UNITED STATES' THEN 'US' ELSE c.recipient_country END,
      bl.country_code) AS country_code,
    COALESCE(bl.city,c.recipient_city) AS location_city,
    COALESCE(bl.county,c.recipient_county) AS location_county,
    COALESCE(bl.state_code,c.recipient_state) AS location_state,
    COALESCE(bl.postal_code,c.recipient_zip) AS location_postal,
    concat_ws(', ',COALESCE(bl.city,c.recipient_city),COALESCE(bl.state_code,c.recipient_state)) AS location_label,
    CASE WHEN bl.verified_headquarters THEN 'Verified headquarters'
      WHEN bl.company_id IS NOT NULL THEN 'Supported operating location'
      WHEN c.recipient_city IS NOT NULL OR c.recipient_state IS NOT NULL THEN 'Observed recipient location'
      ELSE 'Location not reported' END AS location_basis,
    ta.government_business::text,ta.obligations_12m::text,
    COALESCE(ea.known_locations,'0') AS known_locations,
    lt.action_date::text AS latest_transaction_date,lt.obligation::text AS latest_transaction_obligation,
    lt.is_material AS latest_transaction_material,
    lc.assessment_type AS latest_change_type,lc.as_of_date::text AS latest_change_date,lc.score::text AS latest_change_score,
    lc.data_sufficiency AS latest_change_sufficiency,lc.components AS latest_change_components,
    lc.explanation AS latest_change_explanation,
    ass.expansion_score::text,ass.expansion_date::text,ass.expansion_sufficiency,ass.expansion_components,ass.expansion_explanation,
    ass.relocation_score::text,ass.relocation_date::text,ass.relocation_sufficiency,ass.relocation_components,ass.relocation_explanation,
    ass.contraction_score::text,ass.contraction_date::text,ass.contraction_sufficiency,ass.contraction_components,ass.contraction_explanation,
    COALESCE(sc.has_opening,false) OR COALESCE(ea.has_opening,false) AS has_opening,
    COALESCE(sc.has_expansion,false) AS has_confirmed_expansion,
    COALESCE(sc.has_relocation,false) AS has_confirmed_relocation,
    COALESCE(sc.has_contraction,false) OR COALESCE(ea.has_closing,false) AS has_confirmed_contraction,
    COALESCE(sr.has_registration,false) AS has_registration,
    EXISTS (SELECT 1 FROM company_watches w WHERE w.company_id=c.id AND w.user_id=$1::uuid) AS watched
  FROM companies c
  LEFT JOIN companies p ON p.id=c.parent_company_id
  LEFT JOIN industries i ON i.id=c.primary_industry_id
  LEFT JOIN transaction_activity ta ON ta.company_id=c.id
  LEFT JOIN latest_transaction lt ON lt.company_id=c.id
  LEFT JOIN award_activity aa ON aa.company_id=c.id
  LEFT JOIN global_activity ga ON ga.company_id=c.id
  LEFT JOIN establishment_activity ea ON ea.company_id=c.id
  LEFT JOIN best_location bl ON bl.company_id=c.id
  LEFT JOIN assessment_summary ass ON ass.company_id=c.id
  LEFT JOIN latest_change lc ON lc.company_id=c.id
  LEFT JOIN supported_change sc ON sc.company_id=c.id
  LEFT JOIN supported_license sl ON sl.company_id=c.id
  LEFT JOIN supported_registration sr ON sr.company_id=c.id
  WHERE NOT c.is_demo AND NOT c.is_benchmark AND (
    COALESCE(ta.has_positive_transaction,false) OR COALESCE(aa.has_positive_award,false)
    OR COALESCE(ga.has_positive_process,false) OR COALESCE(ea.has_operating_location,false)
    OR COALESCE(sl.has_license,false) OR COALESCE(sr.has_registration,false)
    OR sc.company_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM company_watches w WHERE w.company_id=c.id)
  )
)`;

function applyCommonFilters(filters: SqlFilters, input: CompanyScreenerInput | PredictionInput) {
  if (input.industry) filters.add("s.industry_slug=?", input.industry);
  if (input.country)
    filters.add("upper(s.country_code)=ANY(?::text[])", countryVariants(input.country));
  if (input.state) filters.add("upper(s.location_state)=?", input.state);
  if (input.county)
    filters.add("(s.location_county ILIKE ? OR s.location_county=?)", input.county);
  if (input.city) filters.add("s.location_city ILIKE ?", input.city);
  if ("postal" in input && input.postal)
    filters.add("s.location_postal ILIKE ? || '%'", input.postal);
  if (input.governmentMin != null)
    filters.add("s.government_business::numeric >= ?", input.governmentMin);
}

function applyScreenerFilters(filters: SqlFilters, input: CompanyScreenerInput) {
  applyCommonFilters(filters, input);
  if (input.q) {
    filters.add(
      "(s.canonical_name ILIKE '%' || ? || '%' OR s.legal_name ILIKE '%' || ? || '%' OR s.parent_company_name ILIKE '%' || ? || '%')",
      input.q,
    );
  }
  if (input.obligations12mMin != null)
    filters.add("s.obligations_12m::numeric >= ?", input.obligations12mMin);
  if (input.knownLocations != null)
    filters.add("s.known_locations::integer >= ?", input.knownLocations);
  if (input.trackedOnly) filters.clauses.push("s.watched");
  if (input.latestSignal === "award_increased")
    filters.clauses.push("s.latest_transaction_material AND s.latest_transaction_obligation::numeric > 0");
  if (input.latestSignal === "award_decreased")
    filters.clauses.push("s.latest_transaction_material AND s.latest_transaction_obligation::numeric < 0");
  if (input.latestSignal === "expansion")
    filters.clauses.push("s.expansion_score IS NOT NULL");
  if (input.latestSignal === "move")
    filters.clauses.push("s.relocation_score IS NOT NULL");
  if (input.latestSignal === "contraction")
    filters.clauses.push("s.contraction_score IS NOT NULL");

  const changeClauses: Record<string, string> = {
    opening: "s.has_opening",
    growing: "(s.expansion_score IS NOT NULL OR s.latest_change_type='growth')",
    expansion: "(s.expansion_score IS NOT NULL OR s.has_confirmed_expansion)",
    moving: "(s.relocation_score IS NOT NULL OR s.has_confirmed_relocation)",
    shrinking: "(s.contraction_score IS NOT NULL OR s.has_confirmed_contraction)",
    closing: "s.has_confirmed_contraction",
    new_business: "s.has_registration",
  };
  if (input.change && changeClauses[input.change])
    filters.clauses.push(changeClauses[input.change]);
}

function sortSql(sort: CompanySort) {
  const sorts: Record<CompanySort, string> = {
    government_desc: "s.government_business::numeric DESC NULLS LAST,s.canonical_name",
    obligations_12m_desc: "s.obligations_12m::numeric DESC NULLS LAST,s.canonical_name",
    latest_signal:
      "greatest(s.latest_transaction_date::date,s.latest_change_date::date) DESC NULLS LAST,s.canonical_name",
    latest_change: "s.latest_change_date::date DESC NULLS LAST,s.canonical_name",
    company: "s.canonical_name",
  };
  return sorts[sort];
}

export async function searchCompanySnapshots(
  input: CompanyScreenerInput,
  plan: Plan,
  userId: string | null = null,
): Promise<CompanyScreenerResult> {
  const filters = new SqlFilters(userId);
  applyScreenerFilters(filters, input);
  const entitlementLimit = searchResultLimit(plan);
  const pageSize = Math.max(1, Math.min(input.pageSize, entitlementLimit));
  const offset = Math.max(0, (input.page - 1) * pageSize);
  const values = [...filters.values, pageSize, offset];
  const rows = await query<CompanySnapshotRow>(
    `${SNAPSHOT_CTES}
     SELECT s.*,count(*) OVER()::text AS full_count
     FROM company_snapshot s ${filters.text()}
     ORDER BY ${sortSql(input.sort)}
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  const total = Number(rows[0]?.full_count || 0);
  const visibleTotal = Math.min(total, entitlementLimit);
  return {
    rows,
    total,
    visibleTotal,
    page: input.page,
    pageSize,
    resultLimited: total > visibleTotal,
  };
}

const PREDICTION_CONFIG: Record<PredictionKind, { prediction: string }> = {
  expansion: { prediction: "company_expansion" },
  moves: { prediction: "company_relocation" },
  contraction: { prediction: "company_contraction" },
};

export type PredictionCompanyRow = CompanySnapshotRow & {
  probability: string | null;
  prediction_sufficiency: string | null;
  probability_eligible: boolean | null;
  model_status: string | null;
  horizon_days: number | null;
};

export async function searchPredictionCompanies(
  kind: PredictionKind,
  input: PredictionInput,
  plan: Plan,
  userId: string | null = null,
): Promise<Omit<CompanyScreenerResult, "rows"> & { rows: PredictionCompanyRow[] }> {
  const filters = new SqlFilters(userId);
  applyCommonFilters(filters, input);
  const config = PREDICTION_CONFIG[kind];
  const scoreColumn = kind === "moves" ? "relocation" : kind;
  filters.clauses.push(`s.${scoreColumn}_score IS NOT NULL`);
  if (input.recencyDays) {
    filters.add(
      `s.${scoreColumn}_date::date >= current_date - (?::integer * interval '1 day')`,
      input.recencyDays,
    );
  }
  filters.add("(cp.horizon_days=? OR cp.horizon_days IS NULL)", input.horizon || 180);
  const entitlementLimit = searchResultLimit(plan);
  const pageSize = Math.min(25, entitlementLimit);
  const offset = Math.max(0, (input.page - 1) * pageSize);
  const values = [...filters.values, pageSize, offset];
  const rows = await query<PredictionCompanyRow>(
    `${SNAPSHOT_CTES}
     SELECT s.*,cp.probability::text,cp.data_sufficiency AS prediction_sufficiency,
       pm.probability_eligible,pm.status AS model_status,cp.horizon_days,count(*) OVER()::text AS full_count
     FROM company_snapshot s
     LEFT JOIN LATERAL (
       SELECT p.* FROM company_change_predictions p
       WHERE p.company_id=s.id::uuid AND p.prediction_type='${config.prediction}'
       ORDER BY p.as_of_date DESC,p.generated_at DESC LIMIT 1
     ) cp ON true
     LEFT JOIN prediction_models pm ON pm.id=cp.model_id
     ${filters.text()}
     ORDER BY s.${scoreColumn}_score::numeric DESC NULLS LAST,s.${scoreColumn}_date::date DESC,s.canonical_name
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  const total = Number(rows[0]?.full_count || 0);
  const visibleTotal = Math.min(total, entitlementLimit);
  return {
    rows,
    total,
    visibleTotal,
    page: input.page,
    pageSize,
    resultLimited: total > visibleTotal,
  };
}

export type CompanyFilterOptions = {
  industries: Array<{ slug: string; name: string }>;
  countries: Array<{ value: string; label: string }>;
  states: string[];
  counties: string[];
  cities: string[];
};

const COUNTRY_LABELS: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  GBR: "United Kingdom",
  EU: "European Union",
  DEU: "Germany",
  FRA: "France",
  ESP: "Spain",
  ITA: "Italy",
  NLD: "Netherlands",
  BEL: "Belgium",
  IRL: "Ireland",
  POL: "Poland",
  CZE: "Czechia",
  ROU: "Romania",
  BGR: "Bulgaria",
  HRV: "Croatia",
  AUT: "Austria",
  SWE: "Sweden",
  FIN: "Finland",
  PRT: "Portugal",
  HUN: "Hungary",
  SVN: "Slovenia",
};

const COUNTRY_VARIANTS: Record<string, string[]> = {
  US: ["US", "USA", "UNITED STATES"],
  GB: ["GB", "GBR", "UK", "UNITED KINGDOM"],
  AU: ["AU", "AUS", "AUSTRALIA"],
  CA: ["CA", "CAN", "CANADA"],
  DE: ["DE", "DEU", "GERMANY"],
  FR: ["FR", "FRA", "FRANCE"],
  ES: ["ES", "ESP", "SPAIN"],
  IT: ["IT", "ITA", "ITALY"],
  NL: ["NL", "NLD", "NETHERLANDS"],
  BE: ["BE", "BEL", "BELGIUM"],
  IE: ["IE", "IRL", "IRELAND"],
  PL: ["PL", "POL", "POLAND"],
  SE: ["SE", "SWE", "SWEDEN"],
  FI: ["FI", "FIN", "FINLAND"],
  PT: ["PT", "PRT", "PORTUGAL"],
  RO: ["RO", "ROU", "ROMANIA"],
  HR: ["HR", "HRV", "CROATIA"],
};

function canonicalCountry(value: string) {
  const upper = value.toUpperCase();
  return Object.entries(COUNTRY_VARIANTS).find(([, variants]) => variants.includes(upper))?.[0] || upper;
}

function countryVariants(value: string) {
  const canonical = canonicalCountry(value);
  return COUNTRY_VARIANTS[canonical] || [canonical];
}

export function countryLabel(value: string | null | undefined) {
  if (!value) return "Country not reported";
  const canonical = canonicalCountry(value);
  if (COUNTRY_LABELS[canonical]) return COUNTRY_LABELS[canonical];
  if (canonical.length === 2) {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(canonical) || canonical;
    } catch {
      return canonical;
    }
  }
  return canonical.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function getCompanyFilterOptions(
  country?: string,
  state?: string,
  county?: string,
): Promise<CompanyFilterOptions> {
  const countryValue = country?.toUpperCase();
  const rows = await query<{
    industries: Array<{ slug: string; name: string }>;
    countries: string[];
    states: string[];
    counties: string[];
    cities: string[];
  }>(`SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object('slug',slug,'name',name) ORDER BY name) FROM industries),'[]'::jsonb) AS industries,
    COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM (
      SELECT DISTINCT COALESCE(NULLIF(legal_entity_country,''),
        CASE WHEN recipient_country='UNITED STATES' THEN 'US' ELSE recipient_country END) AS value
      FROM companies WHERE NOT is_demo AND NOT is_benchmark
        AND COALESCE(NULLIF(legal_entity_country,''),recipient_country) IS NOT NULL
    ) country_options),'[]'::jsonb) AS countries,
    COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM (
      SELECT DISTINCT recipient_state AS value FROM companies
      WHERE NOT is_demo AND NOT is_benchmark AND recipient_state IS NOT NULL
        AND ($1::text[] IS NULL OR upper(COALESCE(NULLIF(legal_entity_country,''),
          CASE WHEN recipient_country='UNITED STATES' THEN 'US' ELSE recipient_country END))=ANY($1::text[]))
    ) state_options),'[]'::jsonb) AS states,
    COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM (
      SELECT DISTINCT recipient_county AS value FROM companies
      WHERE NOT is_demo AND NOT is_benchmark AND recipient_county IS NOT NULL
        AND $2::text IS NOT NULL AND recipient_state=$2
    ) county_options),'[]'::jsonb) AS counties,
    COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM (
      SELECT DISTINCT recipient_city AS value FROM companies
      WHERE NOT is_demo AND NOT is_benchmark AND recipient_city IS NOT NULL
        AND $2::text IS NOT NULL AND recipient_state=$2
        AND ($3::text IS NULL OR recipient_county=$3)
    ) city_options),'[]'::jsonb) AS cities`, [countryValue ? countryVariants(countryValue) : null, state?.toUpperCase() || null, county || null]);
  const options = rows[0] || { industries: [], countries: [], states: [], counties: [], cities: [] };
  return {
    industries: options.industries,
    countries: Array.from(
      new Map(options.countries.map((value) => {
        const canonical = canonicalCountry(value);
        return [canonical, { value: canonical, label: countryLabel(canonical) }];
      })).values(),
    ).sort((left, right) => left.label.localeCompare(right.label)),
    states: options.states,
    counties: options.counties,
    cities: options.cities,
  };
}

export async function getHomepageCompanyExamples() {
  const result = await searchCompanySnapshots(
    {
      page: 1,
      pageSize: 5,
      sort: "government_desc",
      trackedOnly: false,
    },
    "free",
  );
  return result.rows.slice(0, 5);
}

export async function getCompanySnapshotBySlug(
  slug: string,
  userId: string | null = null,
): Promise<CompanySnapshotRow | null> {
  const rows = await query<CompanySnapshotRow>(
    `${SNAPSHOT_CTES}
     SELECT s.* FROM company_snapshot s WHERE s.slug=$2 LIMIT 1`,
    [userId, slug],
  );
  return rows[0] || null;
}

