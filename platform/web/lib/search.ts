import "server-only";
import { query } from "@/lib/db";
import {
  can,
  entitlementsFor,
  historyCutoff,
  searchResultLimit,
  type Plan,
} from "@/lib/entitlements";

export type SearchMode = "companies" | "contracts";
export type SearchInput = {
  mode: SearchMode;
  country: "US" | "GB";
  q?: string;
  page: number;
  pageSize: number;
  sort: "newest" | "largest" | "company" | "agency";
  recipientState?: string;
  recipientCounty?: string;
  recipientCity?: string;
  recipientZip?: string;
  performanceState?: string;
  performanceCounty?: string;
  performanceCity?: string;
  performanceZip?: string;
  dateFrom?: string;
  dateTo?: string;
  minValue?: number;
  maxValue?: number;
  agency?: string;
  subagency?: string;
  industry?: string;
  naics?: string;
  psc?: string;
  predictionMin?: number;
  momentumMin?: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value || undefined;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseSearchInput(params: RawParams): SearchInput {
  const sort = one(params.sort);
  return {
    mode: one(params.mode) === "companies" ? "companies" : "contracts",
    country: one(params.country) === "GB" ? "GB" : "US",
    q: one(params.q),
    page: Math.floor(positiveNumber(one(params.page), 1)),
    pageSize: Math.min(
      100,
      Math.floor(positiveNumber(one(params.page_size), 20)),
    ),
    sort: ["newest", "largest", "company", "agency"].includes(sort || "")
      ? (sort as SearchInput["sort"])
      : "newest",
    recipientState: one(params.recipient_state)?.toUpperCase(),
    recipientCounty: one(params.recipient_county),
    recipientCity: one(params.recipient_city),
    recipientZip: one(params.recipient_zip),
    performanceState: one(params.performance_state)?.toUpperCase(),
    performanceCounty: one(params.performance_county),
    performanceCity: one(params.performance_city),
    performanceZip: one(params.performance_zip),
    dateFrom: one(params.date_from),
    dateTo: one(params.date_to),
    minValue: one(params.min_value) ? Number(one(params.min_value)) : undefined,
    maxValue: one(params.max_value) ? Number(one(params.max_value)) : undefined,
    agency: one(params.agency),
    subagency: one(params.subagency),
    industry: one(params.industry),
    naics: one(params.naics),
    psc: one(params.psc),
    predictionMin: one(params.prediction_min)
      ? Number(one(params.prediction_min))
      : undefined,
    momentumMin: one(params.momentum_min)
      ? Number(one(params.momentum_min))
      : undefined,
  };
}

class SqlWhere {
  clauses: string[] = [];
  values: unknown[] = [];

  add(sql: string, value: unknown): void {
    this.values.push(value);
    this.clauses.push(sql.replace("?", `$${this.values.length}`));
  }

  text(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(" AND ")}` : "";
  }
}

function hasPerformanceFilter(input: SearchInput): boolean {
  return Boolean(
    input.performanceState ||
    input.performanceCounty ||
    input.performanceCity ||
    input.performanceZip,
  );
}

function constrainedDateFrom(
  input: SearchInput,
  plan: Plan,
): { value?: string; restricted: boolean } {
  const cutoff = historyCutoff(plan);
  if (!cutoff) return { value: input.dateFrom, restricted: false };
  const cutoffValue = cutoff.toISOString().slice(0, 10);
  if (!input.dateFrom || input.dateFrom < cutoffValue)
    return { value: cutoffValue, restricted: true };
  return { value: input.dateFrom, restricted: false };
}

function applyCommonAwardFilters(
  where: SqlWhere,
  input: SearchInput,
  plan: Plan,
): boolean {
  const date = constrainedDateFrom(input, plan);
  if (input.recipientState)
    where.add("c.recipient_state = ?", input.recipientState);
  if (input.recipientCounty)
    where.add("c.recipient_county_fips = ?", input.recipientCounty);
  if (input.recipientCity)
    where.add("c.recipient_city ILIKE ?", input.recipientCity);
  if (input.recipientZip) where.add("c.recipient_zip = ?", input.recipientZip);
  if (input.performanceState)
    where.add("a.performance_state = ?", input.performanceState);
  if (input.performanceCounty)
    where.add("a.performance_county_fips = ?", input.performanceCounty);
  if (input.performanceCity)
    where.add("a.performance_city ILIKE ?", input.performanceCity);
  if (input.performanceZip)
    where.add("a.performance_zip = ?", input.performanceZip);
  if (date.value) where.add("a.award_date >= ?::date", date.value);
  if (input.dateTo) where.add("a.award_date <= ?::date", input.dateTo);
  if (Number.isFinite(input.minValue))
    where.add(
      "COALESCE(a.potential_value,a.current_value,a.total_obligated) >= ?",
      input.minValue,
    );
  if (Number.isFinite(input.maxValue))
    where.add(
      "COALESCE(a.potential_value,a.current_value,a.total_obligated) <= ?",
      input.maxValue,
    );
  if (input.agency) where.add("a.awarding_agency = ?", input.agency);
  if (input.subagency) where.add("a.awarding_subagency = ?", input.subagency);
  if (input.industry) where.add("i.slug = ?", input.industry);
  if (input.naics) where.add("a.naics LIKE ? || '%'", input.naics);
  if (input.psc) where.add("a.psc LIKE ? || '%'", input.psc.toUpperCase());
  return date.restricted;
}

function addTextSearch(where: SqlWhere, input: SearchInput): void {
  if (!input.q) return;
  const values = Array(7).fill(input.q);
  const start = where.values.length;
  where.values.push(...values);
  where.clauses.push(
    `(to_tsvector('english',coalesce(a.title,'') || ' ' || coalesce(a.description,'')) @@ plainto_tsquery('english',$${start + 1})
      OR c.canonical_name ILIKE '%' || $${start + 2} || '%' OR a.piid ILIKE '%' || $${start + 3} || '%'
      OR a.generated_award_id ILIKE '%' || $${start + 4} || '%' OR a.awarding_agency ILIKE '%' || $${start + 5} || '%'
      OR a.naics ILIKE $${start + 6} || '%' OR a.psc ILIKE $${start + 7} || '%')`,
  );
}

function applyFilters(
  where: SqlWhere,
  input: SearchInput,
  plan: Plan,
): boolean {
  const copy = { ...input, q: undefined };
  const restricted = applyCommonAwardFilters(where, copy, plan);
  addTextSearch(where, input);
  return restricted;
}

export type SearchResult<T> = {
  rows: T[];
  total: number;
  visibleTotal: number;
  page: number;
  pageSize: number;
  performanceLocked: boolean;
  historyRestricted: boolean;
  resultLimited: boolean;
  intelligenceLocked: boolean;
};

export type ContractRow = {
  id: string;
  generated_award_id: string | null;
  piid: string | null;
  title: string | null;
  description: string | null;
  canonical_name: string;
  company_slug: string;
  awarding_agency: string | null;
  awarding_subagency: string | null;
  award_date: string | null;
  total_obligated: string | null;
  current_value: string | null;
  potential_value: string | null;
  naics: string | null;
  psc: string | null;
  industry_name: string | null;
  industry_slug: string | null;
  recipient_city: string | null;
  recipient_county: string | null;
  recipient_state: string | null;
  performance_city: string | null;
  performance_county: string | null;
  performance_state: string | null;
  legal_name: string;
  uei: string | null;
  parent_company: string | null;
  recipient_zip: string | null;
  performance_zip: string | null;
  action_date: string | null;
  obligation: string | null;
  source_url: string | null;
  is_demo: boolean;
  href?: string;
  source_country?: string;
  currency?: string | null;
  prediction_probability?: string | null;
  prediction_sufficiency?: string | null;
};

function intelligenceLocked(input: SearchInput, plan: Plan): boolean {
  return Boolean(
    (input.predictionMin != null && !can(plan, "prediction_filters")) ||
    (input.momentumMin != null && !can(plan, "momentum_filters")),
  );
}

function applyUSIntelligenceFilters(
  where: SqlWhere,
  input: SearchInput,
  plan: Plan,
  mode: SearchMode,
): void {
  if (input.predictionMin != null && can(plan, "prediction_filters")) {
    const entity =
      mode === "companies"
        ? "p.company_id=c.id AND p.prediction_type='new_award'"
        : "p.award_id=a.id AND p.prediction_type='contract_change'";
    where.add(
      `EXISTS (SELECT 1 FROM predictions p WHERE ${entity} AND p.data_sufficiency='sufficient' AND p.probability >= ? AND p.as_of_date=(SELECT max(p2.as_of_date) FROM predictions p2 WHERE ${mode === "companies" ? "p2.company_id=c.id AND p2.prediction_type='new_award'" : "p2.award_id=a.id AND p2.prediction_type='contract_change'"}))`,
      input.predictionMin,
    );
  }
  if (
    mode === "companies" &&
    input.momentumMin != null &&
    can(plan, "momentum_filters")
  ) {
    where.add(
      "EXISTS (SELECT 1 FROM company_momentum m WHERE m.company_id=c.id AND m.score >= ? AND m.as_of_date=(SELECT max(m2.as_of_date) FROM company_momentum m2 WHERE m2.company_id=c.id))",
      input.momentumMin,
    );
  }
}

export async function searchContracts(
  input: SearchInput,
  plan: Plan,
  exportMode = false,
): Promise<SearchResult<ContractRow>> {
  if (input.country === "GB") return searchUKProcesses(input, plan, exportMode);
  const where = new SqlWhere();
  where.clauses.push("NOT a.is_benchmark");
  const historyRestricted = applyFilters(where, input, plan);
  applyUSIntelligenceFilters(where, input, plan, "contracts");
  const from = `FROM awards a JOIN companies c ON c.id=a.recipient_company_id
    LEFT JOIN companies p ON p.id=c.parent_company_id LEFT JOIN industries i ON i.id=a.primary_industry_id
    LEFT JOIN LATERAL (SELECT action_date,obligation FROM transactions WHERE award_id=a.id ORDER BY action_date DESC NULLS LAST,created_at DESC LIMIT 1) tx ON true
    LEFT JOIN LATERAL (SELECT probability,data_sufficiency FROM predictions WHERE award_id=a.id AND prediction_type='contract_change' ORDER BY as_of_date DESC,horizon_days LIMIT 1) pred ON true`;
  const countRows = await query<{ count: string }>(
    `SELECT count(*)::text AS count ${from} ${where.text()}`,
    where.values,
  );
  const total = Number(countRows[0]?.count || 0);
  const performanceLocked =
    hasPerformanceFilter(input) && !can(plan, "performance_location_search");
  const entitlementLimit = exportMode
    ? Number(entitlementsFor(plan).monthly_export_rows)
    : searchResultLimit(plan);
  const effectiveLimit = performanceLocked
    ? Math.min(5, entitlementLimit)
    : entitlementLimit;
  const visibleTotal = Math.min(total, effectiveLimit);
  const pageSize = exportMode
    ? Math.max(1, effectiveLimit)
    : Math.min(input.pageSize, effectiveLimit);
  const offset = exportMode
    ? 0
    : Math.min((input.page - 1) * pageSize, visibleTotal);
  const sortSql = {
    newest: "a.award_date DESC NULLS LAST,a.id",
    largest:
      "COALESCE(a.potential_value,a.current_value,a.total_obligated) DESC NULLS LAST,a.id",
    company: "c.canonical_name,a.award_date DESC NULLS LAST",
    agency: "a.awarding_agency NULLS LAST,a.award_date DESC NULLS LAST",
  }[input.sort];
  const values = [...where.values, pageSize, offset];
  const rows = await query<ContractRow>(
    `SELECT a.id::text,a.generated_award_id,a.piid,a.title,a.description,c.canonical_name,c.slug AS company_slug,
       a.awarding_agency,a.awarding_subagency,a.award_date::text,a.total_obligated::text,a.current_value::text,
       a.potential_value::text,a.naics,a.psc,i.name AS industry_name,i.slug AS industry_slug,
       c.legal_name,c.uei,p.canonical_name AS parent_company,c.recipient_city,c.recipient_county,c.recipient_state,c.recipient_zip,
       a.performance_city,a.performance_county,a.performance_state,a.performance_zip,tx.action_date::text,tx.obligation::text,
       a.source_url,a.is_demo,('/contract/' || a.id::text) AS href,'US'::text AS source_country,'USD'::text AS currency,
       pred.probability::text AS prediction_probability,pred.data_sufficiency AS prediction_sufficiency
     ${from} ${where.text()} ORDER BY ${sortSql} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    rows,
    total,
    visibleTotal,
    page: input.page,
    pageSize,
    performanceLocked,
    historyRestricted,
    resultLimited: total > visibleTotal,
    intelligenceLocked: intelligenceLocked(input, plan),
  };
}

export type CompanyRow = {
  id: string;
  slug: string;
  canonical_name: string;
  legal_name: string;
  uei: string | null;
  cage_code: string | null;
  recipient_city: string | null;
  recipient_county: string | null;
  recipient_state: string | null;
  recipient_zip: string | null;
  industry_name: string | null;
  award_count: string;
  total_activity: string | null;
  latest_award: string | null;
  is_demo: boolean;
  source_country?: string;
  currency?: string | null;
  prediction_probability?: string | null;
  prediction_sufficiency?: string | null;
  momentum_score?: number | null;
};

export async function searchCompanies(
  input: SearchInput,
  plan: Plan,
): Promise<SearchResult<CompanyRow>> {
  if (input.country === "GB") return searchUKCompanies(input, plan);
  const where = new SqlWhere();
  where.clauses.push("NOT a.is_benchmark AND NOT c.is_benchmark");
  const historyRestricted = applyFilters(where, input, plan);
  applyUSIntelligenceFilters(where, input, plan, "companies");
  const grouped = `FROM awards a JOIN companies c ON c.id=a.recipient_company_id LEFT JOIN industries i ON i.id=c.primary_industry_id
    LEFT JOIN LATERAL (SELECT probability,data_sufficiency FROM predictions WHERE company_id=c.id AND prediction_type='new_award' ORDER BY as_of_date DESC,horizon_days LIMIT 1) pred ON true
    LEFT JOIN LATERAL (SELECT score FROM company_momentum WHERE company_id=c.id ORDER BY as_of_date DESC LIMIT 1) momentum ON true
    ${where.text()}`;
  const countRows = await query<{ count: string }>(
    `SELECT count(DISTINCT c.id)::text AS count ${grouped}`,
    where.values,
  );
  const total = Number(countRows[0]?.count || 0);
  const performanceLocked =
    hasPerformanceFilter(input) && !can(plan, "performance_location_search");
  const effectiveLimit = performanceLocked ? 5 : searchResultLimit(plan);
  const visibleTotal = Math.min(total, effectiveLimit);
  const pageSize = Math.min(input.pageSize, effectiveLimit);
  const offset = Math.min((input.page - 1) * pageSize, visibleTotal);
  const sortSql =
    input.sort === "largest"
      ? "total_activity DESC NULLS LAST"
      : input.sort === "newest"
        ? "latest_award DESC NULLS LAST"
        : "c.canonical_name";
  const values = [...where.values, pageSize, offset];
  const rows = await query<CompanyRow>(
    `SELECT c.id::text,c.slug,c.canonical_name,c.legal_name,c.uei,c.cage_code,c.recipient_city,c.recipient_county,
       c.recipient_state,c.recipient_zip,i.name AS industry_name,count(DISTINCT a.id)::text AS award_count,
       sum(COALESCE(a.total_obligated,0))::text AS total_activity,max(a.award_date)::text AS latest_award,c.is_demo,
       'US'::text AS source_country,'USD'::text AS currency,max(pred.probability)::text AS prediction_probability,
       max(pred.data_sufficiency) AS prediction_sufficiency,max(momentum.score) AS momentum_score
     ${grouped} GROUP BY c.id,i.name ORDER BY ${sortSql} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    rows,
    total,
    visibleTotal,
    page: input.page,
    pageSize,
    performanceLocked,
    historyRestricted,
    resultLimited: total > visibleTotal,
    intelligenceLocked: intelligenceLocked(input, plan),
  };
}

function applyUKFilters(
  where: SqlWhere,
  input: SearchInput,
  plan: Plan,
  mode: SearchMode,
): boolean {
  const date = constrainedDateFrom(input, plan);
  if (input.q) {
    const start = where.values.length;
    where.values.push(input.q, input.q, input.q, input.q);
    where.clauses.push(
      `(to_tsvector('english',coalesce(p.title,'') || ' ' || coalesce(p.description,'')) @@ plainto_tsquery('english',$${start + 1}) OR c.canonical_name ILIKE '%' || $${start + 2} || '%' OR p.ocid ILIKE '%' || $${start + 3} || '%' OR b.name ILIKE '%' || $${start + 4} || '%')`,
    );
  }
  if (date.value) where.add("p.published_at::date >= ?::date", date.value);
  if (input.dateTo) where.add("p.published_at::date <= ?::date", input.dateTo);
  if (Number.isFinite(input.minValue))
    where.add("p.value_native >= ?", input.minValue);
  if (Number.isFinite(input.maxValue))
    where.add("p.value_native <= ?", input.maxValue);
  if (input.agency) where.add("b.name = ?", input.agency);
  if (input.industry) where.add("i.slug = ?", input.industry);
  if (input.psc) where.add("p.native_category_code LIKE ? || '%'", input.psc);
  if (input.predictionMin != null && can(plan, "prediction_filters")) {
    const relation =
      mode === "companies"
        ? "pr.company_id=c.id AND pr.prediction_type='new_award'"
        : "pr.process_id=p.id AND pr.prediction_type='contract_change'";
    where.add(
      `EXISTS (SELECT 1 FROM predictions pr WHERE ${relation} AND pr.data_sufficiency='sufficient' AND pr.probability >= ?)`,
      input.predictionMin,
    );
  }
  if (
    mode === "companies" &&
    input.momentumMin != null &&
    can(plan, "momentum_filters")
  ) {
    where.add(
      "EXISTS (SELECT 1 FROM company_momentum m WHERE m.company_id=c.id AND m.score >= ?)",
      input.momentumMin,
    );
  }
  return date.restricted;
}

async function searchUKProcesses(
  input: SearchInput,
  plan: Plan,
  exportMode: boolean,
): Promise<SearchResult<ContractRow>> {
  const where = new SqlWhere();
  where.clauses.push("p.source_country='GB' AND NOT p.is_demo");
  const historyRestricted = applyUKFilters(where, input, plan, "contracts");
  const from = `FROM procurement_processes p LEFT JOIN buyers b ON b.id=p.buyer_id
    LEFT JOIN companies c ON c.id=p.primary_supplier_company_id LEFT JOIN industries i ON i.id=p.common_industry_id
    LEFT JOIN LATERAL (SELECT probability,data_sufficiency FROM predictions WHERE process_id=p.id AND prediction_type='contract_change' ORDER BY as_of_date DESC,horizon_days LIMIT 1) pred ON true`;
  const count = await query<{ count: string }>(
    `SELECT count(*)::text AS count ${from} ${where.text()}`,
    where.values,
  );
  const total = Number(count[0]?.count || 0);
  const entitlementLimit = exportMode
    ? Number(entitlementsFor(plan).monthly_export_rows)
    : searchResultLimit(plan);
  const visibleTotal = Math.min(total, entitlementLimit);
  const pageSize = exportMode
    ? Math.max(1, entitlementLimit)
    : Math.min(input.pageSize, entitlementLimit);
  const offset = exportMode
    ? 0
    : Math.min((input.page - 1) * pageSize, visibleTotal);
  const sortSql =
    input.sort === "largest"
      ? "p.value_native DESC NULLS LAST,p.id"
      : input.sort === "company"
        ? "c.canonical_name,p.published_at DESC"
        : input.sort === "agency"
          ? "b.name,p.published_at DESC"
          : "p.published_at DESC NULLS LAST,p.id";
  const values = [...where.values, pageSize, offset];
  const rows = await query<ContractRow>(
    `SELECT p.id::text,p.source_process_id AS generated_award_id,p.ocid AS piid,p.title,p.description,
       c.canonical_name,c.slug AS company_slug,b.name AS awarding_agency,NULL::text AS awarding_subagency,
       COALESCE(p.award_date,p.published_at::date)::text AS award_date,NULL::text AS total_obligated,
       p.value_native::text AS current_value,p.value_native::text AS potential_value,NULL::text AS naics,
       p.native_category_code AS psc,i.name AS industry_name,i.slug AS industry_slug,c.legal_name,NULL::text AS uei,
       NULL::text AS parent_company,c.recipient_city,NULL::text AS recipient_county,c.recipient_state,c.recipient_zip,
       NULL::text AS performance_city,NULL::text AS performance_county,NULL::text AS performance_state,
       NULL::text AS performance_zip,p.published_at::date::text AS action_date,NULL::text AS obligation,p.source_url,
       p.is_demo,('/process/' || p.id::text) AS href,p.source_country,p.currency,
       pred.probability::text AS prediction_probability,pred.data_sufficiency AS prediction_sufficiency
     ${from} ${where.text()} ORDER BY ${sortSql} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    rows,
    total,
    visibleTotal,
    page: input.page,
    pageSize,
    performanceLocked: false,
    historyRestricted,
    resultLimited: total > visibleTotal,
    intelligenceLocked: intelligenceLocked(input, plan),
  };
}

async function searchUKCompanies(
  input: SearchInput,
  plan: Plan,
): Promise<SearchResult<CompanyRow>> {
  const where = new SqlWhere();
  where.clauses.push(
    "p.source_country='GB' AND NOT p.is_demo AND NOT c.is_benchmark",
  );
  const historyRestricted = applyUKFilters(where, input, plan, "companies");
  const from = `FROM procurement_process_suppliers ps JOIN procurement_processes p ON p.id=ps.process_id
    JOIN companies c ON c.id=ps.company_id LEFT JOIN buyers b ON b.id=p.buyer_id
    LEFT JOIN industries i ON i.id=COALESCE(c.primary_industry_id,p.common_industry_id)
    LEFT JOIN LATERAL (SELECT probability,data_sufficiency FROM predictions WHERE company_id=c.id AND prediction_type='new_award' ORDER BY as_of_date DESC,horizon_days LIMIT 1) pred ON true
    LEFT JOIN LATERAL (SELECT score FROM company_momentum WHERE company_id=c.id ORDER BY as_of_date DESC LIMIT 1) momentum ON true`;
  const count = await query<{ count: string }>(
    `SELECT count(DISTINCT c.id)::text AS count ${from} ${where.text()}`,
    where.values,
  );
  const total = Number(count[0]?.count || 0);
  const effectiveLimit = searchResultLimit(plan);
  const visibleTotal = Math.min(total, effectiveLimit);
  const pageSize = Math.min(input.pageSize, effectiveLimit);
  const offset = Math.min((input.page - 1) * pageSize, visibleTotal);
  const sortSql =
    input.sort === "largest"
      ? "total_activity DESC NULLS LAST"
      : input.sort === "newest"
        ? "latest_award DESC NULLS LAST"
        : "c.canonical_name";
  const values = [...where.values, pageSize, offset];
  const rows = await query<CompanyRow>(
    `SELECT c.id::text,c.slug,c.canonical_name,c.legal_name,c.uei,c.cage_code,c.recipient_city,c.recipient_county,
       c.recipient_state,c.recipient_zip,max(i.name) AS industry_name,count(DISTINCT p.id)::text AS award_count,
       CASE WHEN count(DISTINCT p.currency) FILTER (WHERE p.value_native IS NOT NULL)=1
            THEN sum(p.value_native) END::text AS total_activity,
       max(p.published_at)::date::text AS latest_award,c.is_demo,
       'GB'::text AS source_country,
       CASE WHEN count(DISTINCT p.currency) FILTER (WHERE p.value_native IS NOT NULL)=1
            THEN max(p.currency) FILTER (WHERE p.value_native IS NOT NULL) END AS currency,
       max(pred.probability)::text AS prediction_probability,
       max(pred.data_sufficiency) AS prediction_sufficiency,max(momentum.score) AS momentum_score
     ${from} ${where.text()} GROUP BY c.id ORDER BY ${sortSql} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    rows,
    total,
    visibleTotal,
    page: input.page,
    pageSize,
    performanceLocked: false,
    historyRestricted,
    resultLimited: total > visibleTotal,
    intelligenceLocked: intelligenceLocked(input, plan),
  };
}
