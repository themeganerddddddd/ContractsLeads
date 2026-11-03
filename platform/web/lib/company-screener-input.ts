export type CompanySort =
  | "government_desc"
  | "obligations_12m_desc"
  | "latest_signal"
  | "latest_change"
  | "company";

export type CompanyScreenerInput = {
  q?: string;
  industry?: string;
  country?: string;
  state?: string;
  county?: string;
  city?: string;
  postal?: string;
  change?: string;
  governmentMin?: number;
  obligations12mMin?: number;
  knownLocations?: number;
  trackedOnly: boolean;
  latestSignal?: string;
  page: number;
  pageSize: number;
  sort: CompanySort;
};

export type PredictionInput = {
  industry?: string;
  country?: string;
  state?: string;
  county?: string;
  city?: string;
  horizon?: number;
  recencyDays?: number;
  governmentMin?: number;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const optionalNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
const positiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function parseCompanyScreenerInput(raw: RawParams): CompanyScreenerInput {
  const sort = one(raw.sort);
  const allowedSorts = new Set<CompanySort>(["government_desc", "obligations_12m_desc", "latest_signal", "latest_change", "company"]);
  return {
    q: one(raw.q)?.trim() || undefined,
    industry: one(raw.industry)?.trim() || undefined,
    country: one(raw.country)?.trim().toUpperCase() || undefined,
    state: one(raw.state)?.trim().toUpperCase() || undefined,
    county: one(raw.county)?.trim() || undefined,
    city: one(raw.city)?.trim() || undefined,
    postal: one(raw.postal)?.trim() || undefined,
    change: one(raw.change)?.trim() || undefined,
    governmentMin: optionalNumber(one(raw.government_min)),
    obligations12mMin: optionalNumber(one(raw.obligations_12m_min)),
    knownLocations: optionalNumber(one(raw.known_locations)),
    trackedOnly: one(raw.tracked) === "true",
    latestSignal: one(raw.latest_signal)?.trim() || undefined,
    page: positiveInteger(one(raw.page), 1),
    pageSize: Math.min(100, positiveInteger(one(raw.page_size), 25)),
    sort: allowedSorts.has(sort as CompanySort) ? (sort as CompanySort) : "government_desc",
  };
}

export function parsePredictionInput(raw: RawParams): PredictionInput {
  const horizon = optionalNumber(one(raw.horizon));
  const recencyDays = optionalNumber(one(raw.recency));
  return {
    industry: one(raw.industry)?.trim() || undefined,
    country: one(raw.country)?.trim().toUpperCase() || undefined,
    state: one(raw.state)?.trim().toUpperCase() || undefined,
    county: one(raw.county)?.trim() || undefined,
    city: one(raw.city)?.trim() || undefined,
    horizon: horizon && [90, 180, 365].includes(horizon) ? horizon : 180,
    recencyDays: recencyDays && [30, 90, 180, 365].includes(recencyDays) ? recencyDays : 180,
    governmentMin: optionalNumber(one(raw.government_min)),
    page: positiveInteger(one(raw.page), 1),
  };
}
