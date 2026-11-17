import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { archivedSources, filterArchivedAwards, filterArchivedCompanies, findArchivedCompany, awardsForArchivedCompany } from "@/lib/offline-snapshot";

const root = resolve(import.meta.dirname,"..");
describe("bundled source archive",()=>{
 it("is source-backed, dated, and small enough to ship without Neon",()=>{
   expect(archivedSources.lastUpdated).toMatch(/^2026-11-02T/);
   expect(archivedSources.companies).toHaveLength(9);
   expect(archivedSources.awards).toHaveLength(25);
   const json=readFileSync(resolve(root,"data/public-snapshot.json"),"utf8");
   expect(json.length).toBeLessThan(50000);
   expect(json).not.toContain("contact_email");
   expect(json).not.toContain("contact_phone");
   expect(json).not.toContain("prediction_probability");
 });
 it("filters companies and archived federal actions without network or database access",()=>{
   expect(filterArchivedCompanies("lockheed").some(c=>c.name.toLowerCase().includes("lockheed"))).toBe(true);
   expect(filterArchivedCompanies("notarealorganization")).toEqual([]);
   expect(filterArchivedAwards("department").length).toBeGreaterThan(0);
   expect(filterArchivedAwards("nonexistentawardquery")).toEqual([]);
 });
 it("links company records only on exact recipient UEI or name",()=>{
   const c=findArchivedCompany("lockheed-martin");
   expect(c?.name).toBe("Lockheed Martin");
   if(c){
     const related=awardsForArchivedCompany(c);
     expect(related.every(a=>a.uei===c.uei||[c.legalName.toLowerCase(),c.name.toLowerCase()].includes(a.company.toLowerCase()))).toBe(true);
   }
 });
 it("preserves negative federal obligation adjustments and official award URLs",()=>{
   expect(archivedSources.awards.some(a=>a.amount !== null && a.amount<0)).toBe(true);
   expect(archivedSources.awards.every(a=>!a.sourceUrl || a.sourceUrl.startsWith("https://"))).toBe(true);
 });
 it("does not require a database or upstream service for bundled archive reads",()=>{
   const lib=readFileSync(resolve(root,"lib/offline-snapshot.ts"),"utf8");
   expect(lib).not.toContain("@/lib/db");
   expect(lib).not.toContain("DATABASE_URL");
   expect(lib).not.toContain("fetch(");
 });
});
