import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("BusinessCurrent public product", () => {
  it("uses the public brand and required primary navigation", () => {
    const layout = read("app/layout.tsx");
    const header = read("components/Header.tsx");
    expect(layout).toContain("BusinessCurrent — Business change intelligence, nationwide");
    for (const label of ["Radar", "Companies", "Markets", "Tracking", "Alerts"]) {
      expect(header).toContain(`\"${label}\"`);
    }
    for (const label of ["Government Business", "Industries", "Agencies", "Saved searches", "Data Coverage", "Methodology", "Plans"]) {
      expect(header).toContain(`\"${label}\"`);
    }
    expect(header).not.toContain("Federal Ledger");
  });

  it("covers the homepage, radar, markets, tracking, alerts, coverage, and government-business experience", () => {
    expect(read("app/page.tsx")).toContain("Evidence, not guesses");
    expect(read("app/business-change/page.tsx")).toContain("Cards");
    expect(read("app/business-change/page.tsx")).toContain("Table");
    expect(read("app/locations/page.tsx")).toContain("City, county, state, or ZIP");
    expect(read("app/tracked-companies/page.tsx")).toContain("Sources with errors");
    expect(read("app/alerts/page.tsx")).toContain("Evidence changed");
    expect(read("app/data-coverage/page.tsx")).toContain("50 states + DC");
    expect(read("app/search/page.tsx")).toContain("Government Business");
    expect(read("app/companies/page.tsx")).toContain('mode: "companies"');
  });

  it("keeps company and establishment profiles distinct and mobile styles explicit", () => {
    const company = read("app/company/[slug]/page.tsx");
    const establishment = read("app/establishment/[id]/page.tsx");
    const css = read("app/globals.css");
    expect(company).toContain("Company and locations stay distinct");
    expect(company.match(/<a href=\"#/g)).toHaveLength(5);
    expect(establishment).toContain("Physical business location");
    expect(css).toContain("@media(max-width:860px)");
    expect(css).toContain("@media(max-width:600px)");
    expect(css).toContain("overflow-x:auto");
  });
});
