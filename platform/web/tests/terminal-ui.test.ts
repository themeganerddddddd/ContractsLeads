import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCompanyScreenerInput, parsePredictionInput } from "@/lib/company-screener-input";

const root=resolve(import.meta.dirname,"..");
const read=(p:string)=>readFileSync(resolve(root,p),"utf8");

describe("location-first institutional intelligence terminal",()=>{
  it("defaults to the US, preserves state and county filters, and supports a worldwide override",()=>{
    expect(parsePredictionInput({})).toMatchObject({country:"US",rank:"likelihood",page:1});
    expect(parseCompanyScreenerInput({})).toMatchObject({country:"US",sort:"government_desc"});
    expect(parsePredictionInput({country:"us",state:"md",county:"Montgomery County",rank:"recent",q:"Westat"}))
      .toMatchObject({country:"US",state:"MD",county:"Montgomery County",rank:"recent",q:"Westat"});
    expect(parsePredictionInput({country:"ALL"}).country).toBe("ALL");
  });
  it("sorts validated probabilities first without treating evidence scores as event likelihoods",()=>{
    const source=read("lib/company-intelligence.ts");
    expect(source).toContain("pm.probability_eligible = true");
    expect(source).toContain("pm.status = 'active'");
    expect(source).toContain("cp.data_sufficiency = 'sufficient'");
    expect(source).toContain("THEN cp.probability ELSE NULL END DESC NULLS LAST");
    expect(source).toContain("s.${scoreColumn}_score::numeric DESC NULLS LAST");
    const radar=read("components/PredictionScreener.tsx");
    expect(radar).toContain("Evidence strength is not a calibrated probability.");
    expect(radar).toContain("<RankingsEmptyState variant={kind}/>");
  });
  it("renders country, state, and county controls without database queries",()=>{
    const filter=read("components/MarketFilterBar.tsx");
    expect(filter).toContain('name="country"');
    expect(filter).toContain('name="state"');
    expect(filter).toContain('name="county"');
    expect(filter).toContain('["MD","Maryland"]');
    expect(filter).toContain('["LA","Louisiana"]');
    expect(filter).not.toContain("@/lib/db");
  });
  it("does not repeat the unrelated Montgomery County archive across nationwide radar screens",()=>{
    const radar=read("components/PredictionScreener.tsx");
    const directory=read("components/CompanyDirectory.tsx");
    expect(radar).not.toContain("OfflineRecordsExplorer");
    expect(directory).not.toContain("OfflineRecordsExplorer");
    expect(radar).toContain("RankingsEmptyState");
    expect(directory).toContain("RankingsEmptyState");
    expect(read("components/RankingsEmptyState.tsx")).toContain('next: "/contracts"');
    expect(read("app/public-records/page.tsx")).toContain("OfflineRecordsExplorer");
  });
  it("uses ranked tables rather than company cards on main screens and one dropdown arrow",()=>{
    expect(read("app/page.tsx")).toContain('PredictionScreener kind="expansion"');
    expect(read("components/PredictionScreener.tsx")).toContain("terminal-ranking-table");
    expect(read("components/CompanyDirectory.tsx")).toContain("CompanyTable");
    expect(read("components/OfflineRecordsExplorer.tsx")).toContain("terminal-archive-table");
    const header=read("components/Header.tsx");
    expect(header).toContain("<summary>More</summary>");
    expect(header).toContain("bc-primary-nav");
    expect(read("app/layout.tsx")).not.toContain("WorkspaceTopbar");
    expect(header).not.toContain('aria-hidden="true">⌄');
    expect(read("app/product.css")).toContain('.bc-more > summary::after');
  });
});
