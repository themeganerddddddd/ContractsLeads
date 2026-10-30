export type MarketQuery = {
  label: string;
  kind: "postal_code" | "state" | "county" | "city" | "unknown";
  radarParams: URLSearchParams;
};

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

const stateCode = (value: string): string | undefined => {
  const normalized = value.trim().toUpperCase();
  if (STATE_NAMES[normalized]) return normalized;
  return Object.entries(STATE_NAMES).find(([, name]) => name.toUpperCase() === normalized)?.[0];
};

export function parseMarketQuery(value: string): MarketQuery {
  const query = value.trim().replace(/\s+/g, " ");
  const params = new URLSearchParams({ period: "90" });
  if (/^\d{5}$/.test(query)) {
    params.set("postal_code", query);
    return { label: `ZIP ${query}`, kind: "postal_code", radarParams: params };
  }
  const state = stateCode(query);
  if (state) {
    params.set("state", state);
    return { label: STATE_NAMES[state], kind: "state", radarParams: params };
  }
  const parts = query.split(",").map((part) => part.trim()).filter(Boolean);
  const trailingState = parts.length > 1 ? stateCode(parts.at(-1) || "") : undefined;
  if (trailingState) params.set("state", trailingState);
  const place = trailingState ? parts.slice(0, -1).join(", ") : query;
  if (/\b(county|parish|borough|census area|municipality)\b/i.test(place)) {
    params.set("county", place);
    return { label: trailingState ? `${place}, ${trailingState}` : place, kind: "county", radarParams: params };
  }
  if (place) {
    params.set("city", place);
    return { label: trailingState ? `${place}, ${trailingState}` : place, kind: "city", radarParams: params };
  }
  return { label: "United States", kind: "unknown", radarParams: params };
}
