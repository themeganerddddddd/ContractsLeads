import "server-only";

import { query } from "@/lib/db";

export type FormationParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseFormationInput(raw: FormationParams) {
  const month = one(raw.month);
  return {
    state: one(raw.state)?.trim().toUpperCase() || undefined,
    county: one(raw.county)?.trim() || undefined,
    industry: one(raw.industry)?.trim() || undefined,
    month: month && /^\d{4}-\d{2}-\d{2}$/.test(month) ? month : undefined,
  };
}

export function indicationLabel(score: string | number | null | undefined, sufficiency?: string) {
  if (score === null || score === undefined || sufficiency === "insufficient_history") return "Insufficient evidence";
  const value = Number(score);
  return value >= 70 ? "Strong indication" : value >= 40 ? "Moderate indication" : "Limited indication";
}

export async function getCompanyChangeIntelligence(companyId: string) {
  const [outcomes, assessments, predictions, coverage] = await Promise.all([
    query<any>(
      `SELECT DISTINCT ON (outcome_type) id::text,outcome_type,outcome_date::text,announcement_date::text,
       country_code,state_code,county_fips,city,origin_country,origin_state,origin_county_fips,origin_city,
       destination_country,destination_state,destination_county_fips,destination_city,jobs_created,jobs_lost,
       capital_investment::text,currency,square_feet::text,source_system,source_url,verification_status,evidence
       FROM company_outcomes WHERE company_id=$1
       ORDER BY outcome_type,outcome_date DESC,created_at DESC`,
      [companyId],
    ),
    query<any>(
      `SELECT DISTINCT ON (assessment_type) assessment_type,as_of_date::text,score::text,evidence_quality,
       data_sufficiency,model_version,components,explanation
       FROM movement_assessments WHERE company_id=$1 AND model_version='company-change-indication-v2'
       AND assessment_type IN ('expansion','relocation','growth','contraction')
       ORDER BY assessment_type,as_of_date DESC,generated_at DESC`,
      [companyId],
    ),
    query<any>(
      `SELECT DISTINCT ON (p.prediction_type,p.horizon_days) p.prediction_type,p.horizon_days,
       p.as_of_date::text,p.probability::text,p.likelihood_band,p.data_sufficiency,p.reasons,
       pm.version AS model_version,pm.probability_eligible,pm.status AS model_status,pm.notes
       FROM company_change_predictions p JOIN prediction_models pm ON pm.id=p.model_id
       WHERE p.company_id=$1 ORDER BY p.prediction_type,p.horizon_days,p.as_of_date DESC,p.generated_at DESC`,
      [companyId],
    ),
    query<any>(
      `SELECT signal_family,source_system,country_code,state_code,implementation_status,official_url,
       known_limitations,reuse_status FROM signal_source_coverage ORDER BY signal_family,state_code NULLS FIRST`,
    ),
  ]);
  return { outcomes, assessments, predictions, coverage };
}

export async function getFormationActivity(input: ReturnType<typeof parseFormationInput>) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown) => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };
  if (input.state) add("state_code=?", input.state);
  if (input.county) add(/^\d{5}$/.test(input.county) ? "county_fips=?" : "county_fips=?", input.county);
  if (input.industry) add("industry_code=?", input.industry);
  if (input.month) add("as_of_month=?::date", input.month);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [rows, states, counties, industries, months, coverage, predictionModels] = await Promise.all([
    query<any>(
      `SELECT as_of_month::text,country_code,state_code,county_fips,industry_code,industry_label,
       new_registrations,active_registrations,closures_dissolutions,commercial_permits,
       new_construction_permits,tenant_improvement_permits,job_posting_volume,sbir_sttr_awards,nih_grants,
       federal_awards,state_incentives,formation_score::text,activity_level,data_sufficiency,model_version,
       components,coverage FROM formation_activity_snapshots ${where}
       ORDER BY as_of_month DESC,formation_score DESC NULLS LAST,state_code,county_fips,industry_code LIMIT 500`,
      values,
    ),
    query<{ value: string }>("SELECT DISTINCT state_code AS value FROM formation_activity_snapshots WHERE state_code IS NOT NULL ORDER BY value"),
    query<{ value: string }>("SELECT DISTINCT county_fips AS value FROM formation_activity_snapshots WHERE county_fips IS NOT NULL ORDER BY value"),
    query<{ value: string; label: string | null }>("SELECT DISTINCT industry_code AS value,industry_label AS label FROM formation_activity_snapshots ORDER BY label NULLS LAST,value"),
    query<{ value: string }>("SELECT DISTINCT as_of_month::text AS value FROM formation_activity_snapshots ORDER BY value DESC"),
    query<any>("SELECT signal_family,implementation_status,source_system,known_limitations,official_url FROM signal_source_coverage ORDER BY signal_family,state_code NULLS FIRST"),
    query<any>(
      `SELECT DISTINCT ON (model_type) model_type,observation_start::text,test_end::text,sample_counts,metrics,
       probability_eligible,status,notes,version FROM prediction_models WHERE model_type='business_formation'
       ORDER BY model_type,trained_at DESC`,
    ),
  ]);
  return { rows, states, counties, industries, months, coverage, predictionModel: predictionModels[0] || null };
}
