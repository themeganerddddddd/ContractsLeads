import definitions from "../../shared/entitlements.json";

export const planNames = [
  "free",
  "local",
  "pro",
  "analyst",
  "organization",
] as const;
export type Plan = (typeof planNames)[number];
export type Capability = keyof (typeof definitions)["free"];
export type Entitlements = Record<Capability, number | boolean | null>;

export function normalizePlan(value: string | null | undefined): Plan {
  return planNames.includes(value as Plan) ? (value as Plan) : "free";
}

export function entitlementsFor(plan: Plan): Entitlements {
  return definitions[plan] as Entitlements;
}

export function can(plan: Plan, capability: Capability): boolean {
  const value = entitlementsFor(plan)[capability];
  return typeof value === "boolean"
    ? value
    : typeof value === "number"
      ? value > 0
      : value === null;
}

export function searchResultLimit(plan: Plan): number {
  return Number(entitlementsFor(plan).max_search_results);
}

export function historyCutoff(plan: Plan, now = new Date()): Date | null {
  const days = entitlementsFor(plan).history_days;
  if (days === null) return null;
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - Number(days));
  return cutoff;
}
