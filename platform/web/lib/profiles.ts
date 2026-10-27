import "server-only";
import { query } from "@/lib/db";
import { getCompanyMovements } from "@/lib/movements";
import { getCompanyEarlyIndicators } from "@/lib/indicators";
import { getCompanyIntelligenceTimeline, getCompanyTracking } from "@/lib/tracking";
import { getCompanyChangeIntelligence } from "@/lib/change-intelligence";

export async function getDataFreshness(): Promise<string | null> {
  const rows = await query<{ updated: string | null }>(
    `SELECT COALESCE(
       (SELECT max(completed_at)::text FROM ingestion_runs WHERE status='success'),
       (SELECT max(last_success_at)::text FROM data_sources),
       (SELECT greatest(max(last_modified),max(updated_at))::text FROM awards)
     ) AS updated`
  );
  return rows?.[0]?.updated || null;
}

export async function getHomeOverview() {
  const [metrics, recent, largest, companies, industries] = await Promise.all([
    query<{ companies: string; awards: string; activity: string; states: string }>(
      `SELECT count(DISTINCT c.id)::text AS companies,count(DISTINCT a.id)::text AS awards,
       COALESCE(sum(a.total_obligated),0)::text AS activity,
       count(DISTINCT COALESCE(a.performance_state,c.recipient_state))::text AS states
       FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE NOT a.is_benchmark`
    ),
    query<any>(
      `SELECT a.id::text,a.title,a.award_date::text,a.total_obligated::text,a.current_value::text,a.potential_value::text,
       c.canonical_name,c.slug AS company_slug,a.awarding_agency,a.performance_state,a.is_demo
       FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE NOT a.is_benchmark ORDER BY a.award_date DESC NULLS LAST LIMIT 6`
    ),
    query<any>(
      `SELECT a.id::text,a.title,a.award_date::text,a.total_obligated::text,a.current_value::text,a.potential_value::text,
       c.canonical_name,c.slug AS company_slug,a.awarding_agency,a.performance_state,a.is_demo
       FROM awards a JOIN companies c ON c.id=a.recipient_company_id
       WHERE NOT a.is_benchmark ORDER BY COALESCE(a.potential_value,a.current_value,a.total_obligated) DESC NULLS LAST LIMIT 6`
    ),
    query<any>(
      `SELECT c.slug,c.canonical_name,c.recipient_city,c.recipient_state,count(DISTINCT a.id)::text AS award_count,
       sum(COALESCE(a.total_obligated,0))::text AS activity
       FROM companies c JOIN awards a ON a.recipient_company_id=c.id WHERE NOT a.is_benchmark GROUP BY c.id ORDER BY activity DESC LIMIT 6`
    ),
    query<any>(
      `SELECT i.slug,i.name,count(DISTINCT a.id)::text AS award_count,sum(COALESCE(a.total_obligated,0))::text AS activity
       FROM industries i JOIN awards a ON a.primary_industry_id=i.id WHERE NOT a.is_benchmark GROUP BY i.id ORDER BY activity DESC LIMIT 6`
    )
  ]);
  return { metrics: metrics[0], recent, largest, companies, industries, lastUpdated: await getDataFreshness() };
}

export async function getFilterOptions() {
  const [agencies, subagencies, industries] = await Promise.all([
    query<{ value: string }>(`SELECT value FROM (
      SELECT DISTINCT awarding_agency AS value FROM awards WHERE awarding_agency IS NOT NULL AND NOT is_benchmark
      UNION SELECT DISTINCT name AS value FROM buyers WHERE name IS NOT NULL
    ) options ORDER BY value`),
    query<{ value: string }>("SELECT DISTINCT awarding_subagency AS value FROM awards WHERE awarding_subagency IS NOT NULL AND NOT is_benchmark ORDER BY value"),
    query<{ slug: string; name: string }>("SELECT slug,name FROM industries ORDER BY name")
  ]);
  return { agencies: agencies.map((row) => row.value), subagencies: subagencies.map((row) => row.value), industries };
}

export async function getCompanyProfile(slug: string) {
  const rows = await query<any>(
    `SELECT c.*,i.name AS industry_name,i.slug AS industry_slug,p.canonical_name AS parent_company_name
     FROM companies c LEFT JOIN industries i ON i.id=c.primary_industry_id
     LEFT JOIN companies p ON p.id=c.parent_company_id WHERE c.slug=$1 AND NOT c.is_benchmark`,
    [slug]
  );
  const company = rows[0];
  if (!company) return null;
  const [metrics, awards, agencies, locations, annual, industries, events, predictions, momentum, identifiers, globalMetrics, movements, earlyIndicators, tracking, intelligenceTimeline, changeIntelligence] = await Promise.all([
    query<any>(
      `SELECT sum(COALESCE(a.total_obligated,0))::text AS total_activity,count(DISTINCT a.id)::text AS award_count,
       count(t.id)::text AS transaction_count,count(DISTINCT a.awarding_agency)::text AS agency_count,
       count(DISTINCT concat_ws('|',a.performance_state,a.performance_county_fips,a.performance_city))::text AS location_count,
       max(a.award_date)::text AS latest_award
       FROM awards a LEFT JOIN transactions t ON t.award_id=a.id WHERE a.recipient_company_id=$1 AND NOT a.is_benchmark`,
      [company.id]
    ),
    query<any>(
      `SELECT a.id::text,a.generated_award_id,a.piid,a.title,a.description,a.award_date::text,a.total_obligated::text,
       a.current_value::text,a.potential_value::text,a.awarding_agency,a.performance_city,a.performance_state,
       i.name AS industry_name FROM awards a LEFT JOIN industries i ON i.id=a.primary_industry_id
       WHERE a.recipient_company_id=$1 AND NOT a.is_benchmark ORDER BY a.award_date DESC NULLS LAST LIMIT 50`,
      [company.id]
    ),
    query<any>(
      `SELECT awarding_agency AS name,count(*)::text AS award_count,sum(COALESCE(total_obligated,0))::text AS activity
       FROM awards WHERE recipient_company_id=$1 AND NOT is_benchmark GROUP BY awarding_agency ORDER BY activity DESC NULLS LAST LIMIT 10`,
      [company.id]
    ),
    query<any>(
      `SELECT performance_state,performance_county,performance_city,count(*)::text AS award_count,
       sum(COALESCE(total_obligated,0))::text AS activity FROM awards WHERE recipient_company_id=$1 AND NOT is_benchmark
       GROUP BY performance_state,performance_county,performance_city ORDER BY activity DESC NULLS LAST LIMIT 10`,
      [company.id]
    ),
    query<any>(
      `SELECT calendar_year AS year,COALESCE(disclosed_obligations,0)::text AS activity,award_count::text AS awards,
       transaction_count::text AS transactions FROM annual_company_activity WHERE company_id=$1 ORDER BY calendar_year`,
      [company.id]
    ),
    query<any>(
      `SELECT i.name,i.slug,count(*)::text AS award_count,sum(COALESCE(a.total_obligated,0))::text AS activity
       FROM awards a JOIN industries i ON i.id=a.primary_industry_id WHERE a.recipient_company_id=$1 AND NOT a.is_benchmark
       GROUP BY i.id ORDER BY activity DESC NULLS LAST`,
      [company.id]
    ),
    query<any>(
      `SELECT id::text,event_type,event_at::text,title,description,value_delta_native::text,value_native::text,
       currency,source_system,source_country,source_url,evidence
       FROM procurement_events WHERE company_id=$1 ORDER BY event_at DESC LIMIT 100`, [company.id]
    ),
    query<any>(
      `SELECT DISTINCT ON (prediction_type,horizon_days) prediction_type,horizon_days,as_of_date::text,
       probability::text,likelihood_band,data_sufficiency,reasons,feature_snapshot,generated_at::text,
       pm.version AS model_version,pm.metrics,pm.notes
       FROM predictions p JOIN prediction_models pm ON pm.id=p.model_id
       WHERE p.company_id=$1 ORDER BY prediction_type,horizon_days,as_of_date DESC,generated_at DESC`, [company.id]
    ),
    query<any>(
      `SELECT as_of_date::text,score,data_sufficiency,components,explanation
       FROM company_momentum WHERE company_id=$1 ORDER BY as_of_date DESC LIMIT 1`, [company.id]
    ),
    query<any>(
      `SELECT identifier_system,identifier_value,country_code,is_verified,source_url
       FROM entity_identifiers WHERE company_id=$1 ORDER BY is_verified DESC,identifier_system`, [company.id]
    ),
    query<any>(
      `SELECT source_country,count(DISTINCT process_id)::text AS process_count,
       count(*)::text AS event_count,max(event_at)::text AS latest_event
       FROM procurement_events WHERE company_id=$1 GROUP BY source_country ORDER BY source_country`, [company.id]
    ),
    getCompanyMovements(company.id),
    getCompanyEarlyIndicators(company.id),
    getCompanyTracking(company.id),
    getCompanyIntelligenceTimeline(company.id),
    getCompanyChangeIntelligence(company.id),
  ]);
  return {
    company, metrics: metrics[0], awards, agencies, locations, annual, industries, events: events || [], predictions: predictions || [],
    momentum: momentum?.[0] || null, identifiers: identifiers || [], globalMetrics: globalMetrics || [], movements: movements || [], earlyIndicators,
    tracking, intelligenceTimeline, changeIntelligence, lastUpdated: await getDataFreshness()
  };
}

export async function getContractProfile(id: string) {
  const rows = await query<any>(
    `SELECT a.*,a.id::text AS id,c.canonical_name,c.legal_name,c.slug AS company_slug,c.uei,c.cage_code,
     c.recipient_address,c.recipient_city,c.recipient_county,c.recipient_state,c.recipient_zip,
     i.name AS industry_name,i.slug AS industry_slug
     FROM awards a JOIN companies c ON c.id=a.recipient_company_id LEFT JOIN industries i ON i.id=a.primary_industry_id
     WHERE (a.id::text=$1 OR a.generated_award_id=$1) AND NOT a.is_benchmark LIMIT 1`,
    [id]
  );
  const award = rows[0];
  if (!award) return null;
  const [transactions, events, predictions] = await Promise.all([
    query<any>(
      `SELECT id::text,source_transaction_id,action_date::text,action_type,modification_number,obligation::text,
       current_total_value::text,potential_total_value::text,description,source_last_modified::text
       FROM transactions WHERE award_id=$1 AND NOT is_benchmark ORDER BY action_date DESC NULLS LAST,created_at DESC`,
      [award.id]
    ),
    query<any>(
      `SELECT id::text,event_type,event_at::text,title,description,value_delta_native::text,value_native::text,
       currency,source_system,source_country,source_url,evidence
       FROM procurement_events WHERE award_id=$1 ORDER BY event_at DESC`, [award.id]
    ),
    query<any>(
      `SELECT DISTINCT ON (prediction_type,horizon_days) prediction_type,horizon_days,as_of_date::text,
       probability::text,likelihood_band,data_sufficiency,reasons,feature_snapshot,generated_at::text,
       pm.version AS model_version,pm.metrics,pm.notes
       FROM predictions p JOIN prediction_models pm ON pm.id=p.model_id
       WHERE p.award_id=$1 ORDER BY prediction_type,horizon_days,as_of_date DESC,generated_at DESC`, [award.id]
    )
  ]);
  return { award, transactions, events: events || [], predictions: predictions || [], lastUpdated: await getDataFreshness() };
}

export async function getProcessProfile(id: string) {
  const rows = await query<any>(
    `SELECT p.*,p.id::text AS id,b.name AS buyer_name,b.identifier_scheme AS buyer_identifier_scheme,
     b.identifier_value AS buyer_identifier_value,b.address AS buyer_address,i.name AS industry_name,
     i.slug AS industry_slug,c.canonical_name,c.legal_name,c.slug AS company_slug
     FROM procurement_processes p LEFT JOIN buyers b ON b.id=p.buyer_id
     LEFT JOIN industries i ON i.id=p.common_industry_id
     LEFT JOIN companies c ON c.id=p.primary_supplier_company_id
     WHERE (p.id::text=$1 OR p.source_process_id=$1 OR p.ocid=$1) AND NOT p.is_demo LIMIT 1`, [id]
  );
  const process = rows[0];
  if (!process) return null;
  const [suppliers, events, releases, predictions, source, notices, lots, contracts] = await Promise.all([
    query<any>(
      `SELECT c.id::text,c.slug,c.canonical_name,c.legal_name,s.source_supplier_id,s.is_primary
       FROM procurement_process_suppliers s JOIN companies c ON c.id=s.company_id
       WHERE s.process_id=$1 ORDER BY s.is_primary DESC,c.canonical_name`, [process.id]
    ),
    query<any>(
      `SELECT id::text,event_type,event_at::text,title,description,value_delta_native::text,value_native::text,
       currency,source_system,source_country,source_url,evidence
       FROM procurement_events WHERE process_id=$1 ORDER BY event_at DESC`, [process.id]
    ),
    query<any>(
      `SELECT source_release_id,release_date::text,tags,source_url,fetched_at::text
       FROM procurement_process_releases WHERE process_id=$1 ORDER BY release_date DESC`, [process.id]
    ),
    query<any>(
      `SELECT DISTINCT ON (prediction_type,horizon_days) prediction_type,horizon_days,as_of_date::text,
       probability::text,likelihood_band,data_sufficiency,reasons,feature_snapshot,generated_at::text,
       pm.version AS model_version,pm.metrics,pm.notes
       FROM predictions pr JOIN prediction_models pm ON pm.id=pr.model_id
       WHERE pr.process_id=$1 ORDER BY prediction_type,horizon_days,as_of_date DESC,generated_at DESC`, [process.id]
    ),
    query<any>("SELECT * FROM data_sources WHERE source_system=$1", [process.source_system]),
    query<any>(
      `SELECT source_notice_id,publication_number,notice_version,notice_type,notice_subtype,form_type,
       language_codes,publication_date::text,dispatch_date::text,change_notice_id,previous_notice_id,
       source_url,xml_url,fetched_at::text
       FROM procurement_notices WHERE process_id=$1 ORDER BY publication_date DESC,notice_version DESC`, [process.id]
    ),
    query<any>(
      `SELECT id::text,source_lot_id,title,description,status,value_native::text,currency,cpv_codes,
       performance_countries,nuts_codes,tender_deadline::text,source_url
       FROM procurement_lots WHERE process_id=$1 ORDER BY source_lot_id`, [process.id]
    ),
    query<any>(
      `SELECT c.id::text,c.source_contract_id,c.title,c.status,c.signed_at::text,c.start_date::text,c.end_date::text,
       c.value_native::text,c.currency,c.source_url,l.source_lot_id
       FROM procurement_contracts c LEFT JOIN procurement_lots l ON l.id=c.lot_id
       WHERE c.process_id=$1 ORDER BY c.signed_at DESC NULLS LAST,c.source_contract_id`, [process.id]
    )
  ]);
  return { process, suppliers, events, releases, predictions, source: source[0] || null, notices, lots, contracts, lastUpdated: await getDataFreshness() };
}

export async function getBuyerProfile(id: string) {
  const buyers = await query<any>(
    `SELECT b.*,b.id::text AS id,count(DISTINCT p.id)::text AS process_count,
     min(p.published_at)::date::text AS first_publication,max(p.published_at)::date::text AS latest_publication
     FROM buyers b LEFT JOIN procurement_processes p ON p.buyer_id=b.id
     WHERE b.id::text=$1 OR (b.source_system || ':' || b.source_buyer_id)=$1
     GROUP BY b.id LIMIT 1`, [id]
  );
  const buyer = buyers[0];
  if (!buyer) return null;
  const [processes, stages, suppliers] = await Promise.all([
    query<any>(
      `SELECT p.id::text,p.source_process_id,p.title,p.current_stage,p.published_at::date::text,p.value_native::text,
       p.currency,p.source_url,count(DISTINCT ps.company_id)::text AS supplier_count
       FROM procurement_processes p LEFT JOIN procurement_process_suppliers ps ON ps.process_id=p.id
       WHERE p.buyer_id=$1 AND NOT p.is_demo GROUP BY p.id ORDER BY p.published_at DESC NULLS LAST LIMIT 100`, [buyer.id]
    ),
    query<any>(
      `SELECT current_stage,count(*)::text AS count FROM procurement_processes
       WHERE buyer_id=$1 AND NOT is_demo GROUP BY current_stage ORDER BY count(*) DESC`, [buyer.id]
    ),
    query<any>(
      `SELECT c.slug,c.canonical_name,count(DISTINCT p.id)::text AS process_count
       FROM procurement_processes p JOIN procurement_process_suppliers ps ON ps.process_id=p.id
       JOIN companies c ON c.id=ps.company_id WHERE p.buyer_id=$1 AND NOT p.is_demo
       GROUP BY c.id ORDER BY count(DISTINCT p.id) DESC,c.canonical_name LIMIT 25`, [buyer.id]
    )
  ]);
  return { buyer, processes, stages, suppliers, lastUpdated: await getDataFreshness() };
}

export async function getModelAudit() {
  const [models, coverage] = await Promise.all([
    query<any>(
      `SELECT id::text,model_type,version,algorithm,trained_at::text,observation_start::text,
       training_end::text,validation_end::text,test_end::text,horizons,feature_names,coefficients,
       intercept::text,sample_counts,metrics,probability_eligible,status,data_provenance,notes
       FROM prediction_models ORDER BY trained_at DESC`
    ),
    query<any>(
      `SELECT source_system,name,country_code,official_url,coverage_start::text,coverage_end::text,
       update_frequency,quality_status,last_success_at::text,last_record_count,metadata
       FROM data_sources ORDER BY country_code,source_system`
    )
  ]);
  return { models, coverage };
}

export async function getLocationSummary(state: string, countyFips: string) {
  const stateCode = state.toUpperCase();
  const companyLocal = "c.recipient_state=$1 AND c.recipient_county_fips=$2";
  const workLocal = "a.performance_state=$1 AND a.performance_county_fips=$2";
  const [identity, flows, basedCompanies, localWork, agencies, industries] = await Promise.all([
    query<any>(
      `SELECT COALESCE(max(c.recipient_county),max(a.performance_county)) AS county FROM awards a
       JOIN companies c ON c.id=a.recipient_company_id WHERE ((${companyLocal}) OR (${workLocal})) AND NOT a.is_benchmark`,
      [stateCode, countyFips]
    ),
    query<any>(
      `SELECT
       sum(CASE WHEN ${companyLocal} AND ${workLocal} THEN COALESCE(a.total_obligated,0) ELSE 0 END)::text AS local_to_local,
       sum(CASE WHEN ${companyLocal} AND NOT (${workLocal}) THEN COALESCE(a.total_obligated,0) ELSE 0 END)::text AS local_to_outside,
       sum(CASE WHEN NOT (${companyLocal}) AND ${workLocal} THEN COALESCE(a.total_obligated,0) ELSE 0 END)::text AS outside_to_local,
       sum(CASE WHEN NOT (${companyLocal}) AND NOT (${workLocal}) THEN COALESCE(a.total_obligated,0) ELSE 0 END)::text AS outside_to_outside,
       sum(CASE WHEN ${companyLocal} THEN COALESCE(a.total_obligated,0) ELSE 0 END)::text AS won_by_local,
       sum(CASE WHEN ${workLocal} THEN COALESCE(a.total_obligated,0) ELSE 0 END)::text AS performed_local,
       count(DISTINCT CASE WHEN ${companyLocal} THEN c.id END)::text AS local_companies,
       count(DISTINCT CASE WHEN ${workLocal} THEN c.id END)::text AS local_contractors
       FROM awards a JOIN companies c ON c.id=a.recipient_company_id
       WHERE ((${companyLocal}) OR (${workLocal})) AND NOT a.is_benchmark`,
      [stateCode, countyFips]
    ),
    query<any>(
      `SELECT c.slug,c.canonical_name,count(a.id)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity
       FROM companies c LEFT JOIN awards a ON a.recipient_company_id=c.id AND NOT a.is_benchmark WHERE ${companyLocal} AND NOT c.is_benchmark
       GROUP BY c.id ORDER BY activity DESC NULLS LAST LIMIT 12`,
      [stateCode, countyFips]
    ),
    query<any>(
      `SELECT a.id::text,a.title,a.award_date::text,a.total_obligated::text,c.slug AS company_slug,c.canonical_name,
       c.recipient_city,c.recipient_state,(NOT (${companyLocal})) AS outside_company
       FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE ${workLocal} AND NOT a.is_benchmark
       ORDER BY a.award_date DESC NULLS LAST LIMIT 20`,
      [stateCode, countyFips]
    ),
    query<any>(
      `SELECT a.awarding_agency AS name,count(*)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity
       FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE ((${companyLocal}) OR (${workLocal})) AND NOT a.is_benchmark
       GROUP BY a.awarding_agency ORDER BY activity DESC NULLS LAST LIMIT 10`,
      [stateCode, countyFips]
    ),
    query<any>(
      `SELECT i.name,i.slug,count(*)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity
       FROM awards a JOIN companies c ON c.id=a.recipient_company_id JOIN industries i ON i.id=a.primary_industry_id
       WHERE ((${companyLocal}) OR (${workLocal})) AND NOT a.is_benchmark GROUP BY i.id ORDER BY activity DESC NULLS LAST LIMIT 10`,
      [stateCode, countyFips]
    )
  ]);
  if (!identity[0]?.county) return null;
  return { state: stateCode, countyFips, county: identity[0].county, flows: flows[0], basedCompanies, localWork, agencies, industries, lastUpdated: await getDataFreshness() };
}

export async function getAgencyProfile(slug: string) {
  const agencies = await query<any>("SELECT * FROM agencies WHERE slug=$1", [slug]);
  const agency = agencies[0];
  if (!agency) return null;
  const name = agency.name;
  const [recent, contractors, industries, recipientLocations, performanceLocations, annual] = await Promise.all([
    query<any>(`SELECT a.id::text,a.title,a.award_date::text,a.total_obligated::text,c.canonical_name,c.slug AS company_slug FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE a.awarding_agency=$1 AND NOT a.is_benchmark ORDER BY a.award_date DESC NULLS LAST LIMIT 20`, [name]),
    query<any>(`SELECT c.slug,c.canonical_name,count(*)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE a.awarding_agency=$1 AND NOT a.is_benchmark GROUP BY c.id ORDER BY activity DESC NULLS LAST LIMIT 10`, [name]),
    query<any>(`SELECT i.name,i.slug,count(*)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity FROM awards a JOIN industries i ON i.id=a.primary_industry_id WHERE a.awarding_agency=$1 AND NOT a.is_benchmark GROUP BY i.id ORDER BY activity DESC NULLS LAST LIMIT 10`, [name]),
    query<any>(`SELECT c.recipient_state AS state,c.recipient_county AS county,count(*)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE a.awarding_agency=$1 AND NOT a.is_benchmark GROUP BY state,county ORDER BY activity DESC NULLS LAST LIMIT 10`, [name]),
    query<any>(`SELECT a.performance_state AS state,a.performance_county AS county,count(*)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity FROM awards a WHERE a.awarding_agency=$1 AND NOT a.is_benchmark GROUP BY state,county ORDER BY activity DESC NULLS LAST LIMIT 10`, [name]),
    query<any>(`SELECT calendar_year AS year,award_count::text AS awards,transaction_count::text AS transactions,
      COALESCE(disclosed_obligations,0)::text AS activity FROM annual_agency_activity WHERE awarding_agency=$1 ORDER BY calendar_year`, [name])
  ]);
  return { agency, recent, contractors, industries, recipientLocations, performanceLocations, annual, lastUpdated: await getDataFreshness() };
}

export async function getIndustryProfile(slug: string) {
  const rows = await query<any>("SELECT * FROM industries WHERE slug=$1", [slug]);
  const industry = rows[0];
  if (!industry) return null;
  const id = industry.id;
  const [recent, contractors, agencies, recipientLocations, performanceLocations, annual] = await Promise.all([
    query<any>(`SELECT a.id::text,a.title,a.award_date::text,a.total_obligated::text,c.canonical_name,c.slug AS company_slug FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE a.primary_industry_id=$1 AND NOT a.is_benchmark ORDER BY a.award_date DESC NULLS LAST LIMIT 20`, [id]),
    query<any>(`SELECT c.slug,c.canonical_name,count(*)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE a.primary_industry_id=$1 AND NOT a.is_benchmark GROUP BY c.id ORDER BY activity DESC NULLS LAST LIMIT 10`, [id]),
    query<any>(`SELECT awarding_agency AS name,count(*)::text AS awards,sum(COALESCE(total_obligated,0))::text AS activity FROM awards WHERE primary_industry_id=$1 AND NOT is_benchmark GROUP BY awarding_agency ORDER BY activity DESC NULLS LAST LIMIT 10`, [id]),
    query<any>(`SELECT c.recipient_state AS state,c.recipient_county AS county,count(*)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity FROM awards a JOIN companies c ON c.id=a.recipient_company_id WHERE a.primary_industry_id=$1 AND NOT a.is_benchmark GROUP BY state,county ORDER BY activity DESC NULLS LAST LIMIT 10`, [id]),
    query<any>(`SELECT performance_state AS state,performance_county AS county,count(*)::text AS awards,sum(COALESCE(total_obligated,0))::text AS activity FROM awards WHERE primary_industry_id=$1 AND NOT is_benchmark GROUP BY state,county ORDER BY activity DESC NULLS LAST LIMIT 10`, [id]),
    query<any>(`SELECT calendar_year AS year,award_count::text AS awards,transaction_count::text AS transactions,
      COALESCE(disclosed_obligations,0)::text AS activity FROM annual_industry_activity WHERE industry_id=$1 ORDER BY calendar_year`, [id])
  ]);
  return { industry, recent, contractors, agencies, recipientLocations, performanceLocations, annual, lastUpdated: await getDataFreshness() };
}
