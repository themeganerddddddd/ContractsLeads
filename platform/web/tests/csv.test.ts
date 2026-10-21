import { describe, expect, it } from "vitest";
import { contractsToCsv, exportHeaders } from "@/lib/csv";

describe("server CSV", () => {
  it("contains the required recipient and performance fields", () => {
    expect(exportHeaders).toContain("recipient county"); expect(exportHeaders).toContain("performance county"); expect(exportHeaders).toContain("potential value");
  });
  it("escapes quotes and preserves nulls as empty", () => {
    const csv=contractsToCsv([{canonical_name:'Example "Federal" Co',legal_name:"Example",uei:null,parent_company:null,recipient_city:"Rockville",recipient_county:"Montgomery",recipient_state:"MD",recipient_zip:"20850",generated_award_id:"A1",piid:"P1",awarding_agency:"Agency",awarding_subagency:null,award_date:"2026-10-01",action_date:"2026-10-01",obligation:"10",current_value:null,potential_value:"20",description:"Test",naics:"541512",psc:"D302",industry_name:"IT",performance_city:"Reston",performance_county:"Fairfax",performance_state:"VA",performance_zip:"20190",source_url:"https://example.gov",id:"1",title:"Test",company_slug:"example",is_demo:false}] as any);
    expect(csv).toContain('"Example ""Federal"" Co"'); expect(csv).toContain('"recipient county"');
  });
});
