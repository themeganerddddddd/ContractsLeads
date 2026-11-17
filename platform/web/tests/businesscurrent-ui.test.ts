import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("FirmQuarry public product", () => {
  it("uses the public brand and required primary navigation", () => {
    const layout = read("app/layout.tsx");
    const header = read("components/Header.tsx");
    expect(layout).toContain("FirmQuarry — Business change intelligence, nationwide");
    for (const label of ["Overview", "Expansion Intelligence", "Movement Intelligence", "Retention Intelligence", "Companies", "Locations", "Government Contracts"]) {
      expect(header).toContain(`\"${label}\"`);
    }
    for (const label of ["Government Business", "Industries", "Agencies", "Saved", "Alerts", "Coverage", "Methodology"]) {
      expect(header).toContain(`\"${label}\"`);
    }
    expect(header).toContain("My Account");
    expect(header).toContain("Help &amp; Feedback");
    expect(header).not.toContain('["Plans", "/pricing"]');
    expect(header).not.toContain("Owner overview");
    expect(header).not.toContain("Federal Ledger");
  });

  it("covers the sellable homepage and preserves supporting research experiences", () => {
    expect(read("app/workspace/page.tsx")).toContain("ResearchHome");
    expect(read("app/page.tsx")).toContain("ProviderSignInButton");
    expect(read("app/page.tsx")).toContain('href="/pricing"');
    expect(read("components/PredictionScreener.tsx")).toContain("Expansion intelligence");
    expect(read("components/PredictionScreener.tsx")).toContain("Ranked by validated likelihood");
    expect(read("app/workspace/page.tsx")).not.toContain("studio-product-grid");
    expect(read("app/business-change/page.tsx")).toContain("Cards");
    expect(read("app/business-change/page.tsx")).toContain("Table");
    expect(read("components/MarketFilterBar.tsx")).toContain("County / Parish / Local Area");
    expect(read("app/tracked-companies/page.tsx")).toContain("Sources with errors");
    expect(read("app/alerts/page.tsx")).toContain("Evidence changed");
    expect(read("app/data-coverage/page.tsx")).toContain("50 states + DC");
    expect(read("app/methodology/page.tsx")).toContain("at least 5% of that award’s reference value or at least $1 million USD");
    expect(read("app/search/page.tsx")).toContain("Government Business");
    expect(read("components/CompanyDirectory.tsx")).toContain("Search by company or legal name");
    expect(read("components/MarketFilterBar.tsx")).toContain("Government Business — largest");
    expect(read("app/layout.tsx")).toContain('import "./product.css"');
    expect(read("app/layout.tsx")).not.toContain("WorkspaceTopbar");
  });

  it("keeps company and establishment profiles distinct and mobile styles explicit", () => {
    const company = read("app/company/[slug]/page.tsx");
    const establishment = read("app/establishment/[id]/page.tsx");
    const css = read("app/globals.css");
    expect(company).toContain("Company and locations stay distinct");
    expect(company.match(/<a href=\"#/g)).toHaveLength(6);
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
    expect(read("components/ContractHistoryChart.tsx")).toContain("Annual net U.S. obligations");
    expect(company).toContain("ContractHistoryChart");
    expect(read("app/company/[slug]/contracts/page.tsx")).toContain("Federal contract history");
    expect(timeline).toContain("Minor contract modification");
    expect(timeline).toContain("material-adjustment");
    for (const label of ["Exact obligation", "Current total", "Potential total", "Modification", "Action type", "Source"]) {
      expect(contract).toContain(label);
    }
  });
});
