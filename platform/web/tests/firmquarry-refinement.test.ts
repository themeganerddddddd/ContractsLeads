import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePredictionInput } from "@/lib/company-screener-input";

const root = resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("FirmQuarry company research refinements", () => {
  it("puts screener and directory filters above results instead of opening a search modal", () => {
    const prediction = read("components/PredictionScreener.tsx");
    const directory = read("components/CompanyDirectory.tsx");
    expect(prediction).toContain("<MarketFilterBar");
    expect(directory).toContain("<MarketFilterBar");
    expect(prediction).not.toContain("<ResearchCriteriaDialog");
    expect(directory).not.toContain("<ResearchCriteriaDialog");
  });
  it("supports both an interactive dropdown and searchable county names", () => {
    const filter = read("components/MarketFilterBar.tsx");
    expect(filter).toContain('id="market-county-options"');
    expect(filter).toContain('aria-label="Choose county or parish from list"');
    expect(filter).toContain("/api/geography/counties?state=");
    const endpoint = read("app/api/geography/counties/route.ts");
    expect(endpoint).toContain("NOT is_demo AND NOT is_benchmark");
    expect(endpoint).toContain("recipient_state = $1");
  });
  it("does not silently filter out modeled signals by a default six-month date or fixed horizon", () => {
    expect(parsePredictionInput({}).recencyDays).toBe(0);
    expect(parsePredictionInput({}).horizon).toBeUndefined();
    expect(parsePredictionInput({ recency: "90", horizon: "180" })).toMatchObject({ recencyDays: 90, horizon: 180 });
    const sql = read("lib/company-intelligence.ts");
    expect(sql).toContain("cp.probability IS NOT NULL AND cp.data_sufficiency");
    expect(sql).toContain('if (input.horizon) filters.add');
  });
  it("focuses company dossiers by the originating intelligence category and hides irrelevant categories", () => {
    const table = read("components/PredictionScreener.tsx");
    const profile = read("app/company/[slug]/page.tsx");
    expect(table).toContain('?focus=${kind==="moves"?"relocation":kind}');
    expect(profile).toContain("visibleKinds.map(kind => <Outlook");
    expect(profile).toContain('focus={focus}');
    expect(profile).toContain("fq-pitchbook-intro");
  });
  it("does not imply unsourced alternate destinations or embed external donation UI", () => {
    const geographic = read("components/CompanyGeographicOutlook.tsx");
    expect(geographic).toContain('Manually selected research geographies');
    expect(geographic).toContain('destination_claim_supported');
    expect(geographic).toContain('alternative_destinations');
    expect(geographic).not.toContain("<iframe");
  });
  it("temporarily lifts only public search and history caps before billing", () => {
    const entitlements = read("lib/entitlements.ts");
    expect(entitlements).toContain('process.env.BILLING_ENABLED !== "true"');
    expect(entitlements).toContain("Number.MAX_SAFE_INTEGER");
    expect(entitlements).toContain("return null;");
  });
});
