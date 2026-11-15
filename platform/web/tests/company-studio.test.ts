import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Company-first SEO and intelligence experience", () => {
  it("links real company profiles to their paginated source-backed award archive", () => {
    const profile = read("app/company/[slug]/page.tsx");
    const archive = read("app/company/[slug]/contracts/page.tsx");
    expect(profile).toContain("View contract history");
    expect(profile).toContain("Full contract history");
    expect(archive).toContain("LIMIT $4 OFFSET $5");
    expect(archive).toContain("recipient_company_id=$1");
    expect(archive).toContain("award_date DESC");
    expect(archive).not.toContain("estimated revenue");
  });

  it("preserves evidence boundaries and allows changing the chart period", () => {
    const chart = read("components/ContractHistoryChart.tsx");
    const radar = read("components/PredictionScreener.tsx");
    expect(chart).toContain('useState<"5" | "all">');
    expect(chart).toContain("deobligations");
    expect(radar).toContain('row.probability_eligible === true');
    expect(radar).toContain("Evidence strength is not a calibrated probability.");
    expect(radar).toContain("Destination unknown");
  });

  it("uses company-backed metadata, canonical routes and noindex for demo records", () => {
    const company = read("app/company/[slug]/page.tsx");
    const contract = read("app/contract/[id]/page.tsx");
    const archive = read("app/company/[slug]/contracts/page.tsx");
    expect(company).toContain("profile.company.canonical_name");
    expect(company).toContain("index: !profile.company.is_demo");
    expect(contract).toContain("index: !award.is_demo");
    expect(archive).toContain("index: !rows[0].is_demo");
  });
});
