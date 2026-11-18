import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root=resolve(import.meta.dirname,"..");
const read=(p:string)=>readFileSync(resolve(root,p),"utf8");

describe("Retention WARN sourcing and sparse-data company dossiers",()=>{
 it("uses official, verified and company-linked WARN notices, ignoring rescinded notices",()=>{
  const sql=read("lib/company-intelligence.ts");
  for(const snippet of ["warn_events AS MATERIALIZED","maryland_warn","virginia_warn","company_event_companies",
   "ec.review_status IN ('auto_verified','approved')","source_verified","corroborated",
   "e.event_status NOT IN ('rescinded','cancelled')","SELECT DISTINCT ON (ec.company_id,e.id)",
   "warn_notice_count_24m","warn_jobs_affected_24m","latest_warn_source_url"]) expect(sql).toContain(snippet);
  expect(sql).toContain("s.warn_notice_count_24m > 0 OR s.has_confirmed_contraction");
 });
 it("puts contract activity versus normal immediately after company in both search tables",()=>{
  const ranked=read("components/PredictionScreener.tsx");
  expect(ranked.indexOf("<th scope=\"col\">Contracts vs. normal</th>"))
   .toBeLessThan(ranked.indexOf("<th scope=\"col\">Likelihood / indication</th>"));
  expect(ranked).toContain('kind==="contraction"?<th scope="col">WARN / retention alerts</th>');
  const directory=read("components/CompanyTable.tsx");
  expect(directory.indexOf("<th scope=\"col\">Contracts vs. normal</th>"))
   .toBeLessThan(directory.indexOf("<th scope=\"col\">Industry</th>"));
 });
 it("moves contract cycle above general facts and only renders source-backed sections",()=>{
  const source=read("app/company/[slug]/page.tsx");
  expect(source.indexOf("<ProcurementBaselinePanel")).toBeLessThan(source.indexOf('<section id="overview"'));
  for(const gate of ["hasContractBaseline?","hasGeographicEvidence?","hasContacts?","hasLocations?","hasTimeline?","hasContracts?","hasSourceDetails?"]) expect(source).toContain(gate);
  expect(read("components/CompanyContactsCard.tsx")).toContain("if (!published) return null");
  expect(read("components/CompanyWarnNotice.tsx")).toContain("if(count<1)return null");
 });
 it("tracks observed moving records rather than offering unsupported relocation predictions",()=>{
  const header=read("components/Header.tsx");
  expect(header).not.toContain('["Movement Intelligence", "/predicted-moves"]');
  expect(header).toContain("/business-change?tab=moving");
  const route=read("app/predicted-moves/page.tsx");
  expect(route).toContain('redirect("/business-change?"');
  const profile=read("app/company/[slug]/page.tsx");
  expect(profile).toContain("verifiedMovements");
  expect(profile).toContain("MovementTable rows={verifiedMovements}");
 });
});
