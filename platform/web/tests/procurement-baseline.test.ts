import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assessProcurementMomentum } from "@/lib/procurement-baseline";
import { parseCompanyScreenerInput, parsePredictionInput } from "@/lib/company-screener-input";
import { marketHref } from "@/lib/market-filters";

const root=resolve(import.meta.dirname,"..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

describe("company-specific procurement baseline (descriptive only)",()=>{
  it("flags a meaningful surge and slowdown relative to firm history",()=>{
    expect(assessProcurementMomentum({current:1_700_000,annualBaseline:1_000_000,baselineSupported:true})).toMatchObject({status:"above",relativeChangePct:70,difference:700000});
    expect(assessProcurementMomentum({current:520_000,annualBaseline:1_000_000,baselineSupported:true})).toMatchObject({status:"below",relativeChangePct:-48,difference:-480000});
  });
  it("requires both a relative and meaningful dollar change",()=>{
    expect(assessProcurementMomentum({current:112_000,annualBaseline:100_000,baselineSupported:true}).status).toBe("within");
    expect(assessProcurementMomentum({current:100_000,annualBaseline:50_000,baselineSupported:true}).status).toBe("within");
    expect(assessProcurementMomentum({current:1_100_000,annualBaseline:1_000_000,baselineSupported:true}).status).toBe("within");
  });
  it("does not invent a comparison with limited or invalid history",()=>{
    expect(assessProcurementMomentum({current:2_000_000,annualBaseline:0,baselineSupported:true}).status).toBe("insufficient");
    expect(assessProcurementMomentum({current:2_000_000,annualBaseline:500_000,baselineSupported:false}).status).toBe("insufficient");
    expect(assessProcurementMomentum({current:null,annualBaseline:500_000,baselineSupported:true}).status).toBe("insufficient");
  });
  it("accepts the same contract threshold filters in the directory and all signal categories",()=>{
    const query={obligations_12m_min:"500000",baseline_annual_min:"1500000",baseline_trend:"below"};
    for(const input of [parseCompanyScreenerInput(query),parsePredictionInput(query)]){
      expect(input.obligations12mMin).toBe(500000);
      expect(input.baselineAnnualMin).toBe(1500000);
      expect(input.baselineTrend).toBe("below");
    }
    expect(parsePredictionInput({baseline_trend:"invalid"}).baselineTrend).toBeUndefined();
    const href=marketHref("/predicted-moves",{country:"US",baselineAnnualMin:2_000_000,baselineTrend:"above",obligations12mMin:500_000});
    expect(href).toContain("baseline_annual_min=2000000");
    expect(href).toContain("baseline_trend=above");
    expect(href).toContain("obligations_12m_min=500000");
  });
  it("keeps procurement cues distinct from validated outcomes",()=>{
    const code=read("lib/company-intelligence.ts");
    expect(code).toContain("new_work_states_12m");
    expect(code).toContain("obligations_baseline_annual");
    const ranked=read("components/PredictionScreener.tsx");
    expect(ranked).toContain("Procurement research cue · not a probability");
    const panel=read("components/ProcurementBaselinePanel.tsx");
    expect(panel).toContain("not a verified facility or relocation destination");
  });
  it("only shows contacts from official source-matched UEI records",()=>{
    const contacts=JSON.parse(read("data/official-business-contacts.json"));
    expect(Object.values(contacts.byUei).length).toBeGreaterThan(0);
    for(const [uei,contact] of Object.entries(contacts.byUei) as Array<[string, any]>){
      expect(uei).toMatch(/^[A-Z0-9]{12}$/);
      expect(contact.source_url).toMatch(/^https:\/\/(?:www\.)?(?:sam\.gov|gsaelibrary\.gsa\.gov)\//i);
    }
    const view=read("components/CompanyContactsCard.tsx");
    expect(view).toContain("match");
    expect(view).toContain("Separately licensed PitchBook contacts are not republished");
  });
});
