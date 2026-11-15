import "server-only";

/**
 * Read-only, no-secret fallback for public U.S. federal contract records.
 * This is NOT a replacement for the company / establishment intelligence database.
 * No award returned here is interpreted as physical expansion or relocation.
 */
export type OfficialFederalAward = {
  internalId: number;
  generatedId: string | null;
  awardId: string;
  recipient: string;
  amount: number | null;
  agency: string;
  modified: string | null;
  startDate: string | null;
  description: string | null;
  sourceUrl: string;
};

type OfficialRow = {
  internal_id?: unknown;
  generated_internal_id?: unknown;
  "Award ID"?: unknown;
  "Recipient Name"?: unknown;
  "Award Amount"?: unknown;
  "Awarding Agency"?: unknown;
  "Start Date"?: unknown;
  "Last Modified Date"?: unknown;
  Description?: unknown;
};

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dateValue(value: unknown): string | null {
  const date = textValue(value);
  return /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null;
}

export function buildOfficialAwardRequest(input: { recipient?: string; page?: number; limit?: number } = {}, asOf = new Date()) {
  const page = Math.min(100, Math.max(1, Math.trunc(Number(input.page) || 1)));
  const limit = Math.min(25, Math.max(1, Math.trunc(Number(input.limit) || 12)));
  const end = new Date(asOf);
  const start = new Date(asOf);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const filters: Record<string, unknown> = {
    award_type_codes: ["A", "B", "C", "D"],
    time_period: [{
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      date_type: "last_modified_date",
    }],
  };
  if (input.recipient?.trim()) {
    filters.recipient_search_text = [input.recipient.trim().slice(0, 100)];
  }
  return {
    subawards: false,
    filters,
    fields: ["Award ID", "Recipient Name", "Award Amount", "Awarding Agency", "Start Date", "Last Modified Date", "Description", "generated_internal_id"],
    sort: "Last Modified Date",
    order: "desc",
    page,
    limit,
  };
}

function mapAward(row: OfficialRow): OfficialFederalAward | null {
  const internalId = Number(row.internal_id);
  const recipient = textValue(row["Recipient Name"]);
  const awardId = textValue(row["Award ID"]);
  if (!Number.isSafeInteger(internalId) || internalId <= 0 || !recipient || !awardId) return null;
  const rawAmount = row["Award Amount"];
  const amount = rawAmount === null || rawAmount === undefined || rawAmount === "" ? null : Number(rawAmount);
  const rawGeneratedId = textValue(row.generated_internal_id);
  const generatedId = /^(CONT|IDV)_[-A-Za-z0-9_]+$/.test(rawGeneratedId) ? rawGeneratedId : null;
  const sourceUrl = generatedId
    ? `https://www.usaspending.gov/award/${encodeURIComponent(generatedId)}`
    : "https://www.usaspending.gov/search";
  return {
    internalId,
    generatedId,
    awardId,
    recipient,
    amount: amount !== null && Number.isFinite(amount) ? amount : null,
    agency: textValue(row["Awarding Agency"]) || "Not reported",
    modified: dateValue(row["Last Modified Date"]),
    startDate: dateValue(row["Start Date"]),
    description: textValue(row.Description) || null,
    sourceUrl,
  };
}

export async function searchPublicFederalAwards(
  input: { recipient?: string; page?: number; limit?: number } = {},
): Promise<{ awards: OfficialFederalAward[]; page: number; hasNext: boolean; retrievedAt: string }> {
  const body = buildOfficialAwardRequest(input);
  const response = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Official USAspending service returned ${response.status}`);
  const payload = await response.json() as { results?: unknown; page_metadata?: { hasNext?: unknown } };
  if (!Array.isArray(payload.results)) throw new Error("Unexpected USAspending response format");
  const awards = payload.results.map(row => mapAward(row as OfficialRow)).filter((row): row is OfficialFederalAward => row !== null);
  return {
    awards,
    page: body.page,
    hasNext: payload.page_metadata?.hasNext === true,
    retrievedAt: new Date().toISOString(),
  };
}
