export type MarketFilterValues = {
  country?: string;
  state?: string;
  county?: string;
  city?: string;
  q?: string;
  industry?: string;
  recencyDays?: number;
  horizon?: number;
  rank?: string;
  sort?: string;
  governmentMin?: number;
  obligations12mMin?: number;
  baselineAnnualMin?: number;
  baselineTrend?: "above" | "below";
};

/** Build a cross-workspace link without dropping the user's current market. */
export function marketHref(path: string, values: MarketFilterValues) {
  const params = new URLSearchParams();
  if (values.country && values.country !== "US") params.set("country", values.country);
  if (values.state) params.set("state", values.state);
  if (values.county) params.set("county", values.county);
  if (values.city) params.set("city", values.city);
  if (values.q) params.set("q", values.q);
  if (values.industry) params.set("industry", values.industry);
  if (values.rank && values.rank !== "likelihood") params.set("rank", values.rank);
  if (values.sort && values.sort !== "government_desc") params.set("sort", values.sort);
  if (values.recencyDays && values.recencyDays !== 180) params.set("recency", String(values.recencyDays));
  if (values.horizon && values.horizon !== 180) params.set("horizon", String(values.horizon));
  if (values.governmentMin != null) params.set("government_min", String(values.governmentMin));
  if (values.obligations12mMin != null) params.set("obligations_12m_min", String(values.obligations12mMin));
  if (values.baselineAnnualMin != null) params.set("baseline_annual_min", String(values.baselineAnnualMin));
  if (values.baselineTrend) params.set("baseline_trend", values.baselineTrend);
  return path + (params.size ? `?${params.toString()}` : "");
}
