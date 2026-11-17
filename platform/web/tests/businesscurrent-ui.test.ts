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
    for (const label of ["Companies", "Locations", "Predicted Expansion", "Predicted Moves", "Predicted Contraction"]) {
      expect(header).toContain(`\"${label}\"`);
    }
    for (const label of ["Government Business", "Industries", "Agencies", "Saved", "Alerts", "Coverage", "Methodology", "Plans", "Account"]) {
      expect(header).toContain(`\"${label}\"`);
    }
    expect(header).not.toContain("Federal Ledger");
  });

  it("covers the sellable homepage and preserves supporting legacy experiences", () => {
    expect(read("app/page.tsx")).toContain("Find the companies that are changing before everyone else does.");
    expect(read("app/page.tsx")).toContain("Live company intelligence");
    expect(read("app/business-change/page.tsx")).toContain("Cards");
    expect(read("app/business-change/page.tsx")).toContain("Table");
    expect(read("app/locations/page.tsx")).toContain("County / Parish / Local Area");
    expect(read("app/tracked-companies/page.tsx")).toContain("Sources with errors");
    expect(read("app/alerts/page.tsx")).toContain("Evidence changed");
    expect(read("app/data-coverage/page.tsx")).toContain("50 states + DC");
    expect(read("app/methodology/page.tsx")).toContain("at least 5% of that award’s reference value or at least $1 million USD");
    expect(read("app/search/page.tsx")).toContain("Government Business");
    expect(read("app/companies/page.tsx")).toContain("Search by company or legal name");
    expect(read("app/companies/page.tsx")).toContain("Government Business — largest");
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
    expect(css).toContain(".entity-heading h1{max-width:100%;overflow-wrap:anywhere");
  });

  it("keeps materiality in company presentation while contract detail stays complete", () => {
    const company = read("app/company/[slug]/page.tsx");
    const timeline = read("components/CompanyIntelligenceTimeline.tsx");
    const contract = read("app/contract/[id]/page.tsx");
    expect(company).toContain("Annual net U.S. obligations");
    expect(timeline).toContain("Minor contract modification");
    expect(timeline).toContain("material-adjustment");
    for (const label of ["Exact obligation", "Current total", "Potential total", "Modification", "Action type", "Source"]) {
      expect(contract).toContain(label);
    }
  });
});
