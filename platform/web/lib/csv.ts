import type { ContractRow } from "@/lib/search";

export const exportHeaders = [
  "company", "legal company name", "UEI", "parent company", "recipient city", "recipient county", "recipient state",
  "recipient ZIP", "award ID", "PIID", "agency", "subagency", "award date", "action date", "obligation",
  "current value", "potential value", "description", "NAICS", "PSC", "industry", "performance city",
  "performance county", "performance state", "performance ZIP", "source URL"
] as const;

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function contractsToCsv(rows: Array<ContractRow & Record<string, unknown>>): string {
  const lines = rows.map((row) => [
    row.canonical_name, row.legal_name, row.uei, row.parent_company, row.recipient_city, row.recipient_county,
    row.recipient_state, row.recipient_zip, row.generated_award_id, row.piid, row.awarding_agency, row.awarding_subagency,
    row.award_date, row.action_date, row.obligation, row.current_value, row.potential_value, row.description, row.naics,
    row.psc, row.industry_name, row.performance_city, row.performance_county, row.performance_state, row.performance_zip,
    row.source_url
  ].map(csvEscape).join(","));
  return [exportHeaders.map(csvEscape).join(","), ...lines].join("\r\n");
}
