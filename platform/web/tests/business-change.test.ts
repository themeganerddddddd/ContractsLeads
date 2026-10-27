import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import { query } from "@/lib/db";
import {
  BUSINESS_CHANGE_TABS,
  getBusinessChangeCoverage,
  getCompanyEstablishmentIntelligence,
  parseBusinessChangeInput,
  searchBusinessChange,
} from "@/lib/business-change";

const mockedQuery = vi.mocked(query);
const root = resolve(import.meta.dirname, "..");

beforeEach(() => mockedQuery.mockReset());

describe("location-first business change", () => {
  it("exposes the six required independently queryable tabs", () => {
    expect(BUSINESS_CHANGE_TABS).toEqual([
      "opening", "growing", "moving", "closing", "shrinking", "new-businesses",
    ]);
    for (const tab of BUSINESS_CHANGE_TABS) {
      expect(parseBusinessChangeInput({ tab }).tab).toBe(tab);
    }
  });

  it("normalizes location, industry, date, confidence, source, and pagination filters", () => {
    const input = parseBusinessChangeInput({
      tab: "moving", period: "custom", date_from: "2026-10-01", date_to: "2026-10-27",
      state: "md", county: "24031", city: "Rockville", postal_code: "20850",
      industry: "biotechnology", confidence: "strong", source_family: "workforce",
      page: "2", page_size: "500",
    });
    expect(input).toMatchObject({
      tab: "moving", period: "custom", dateFrom: "2026-10-01", dateTo: "2026-10-27",
      state: "MD", county: "24031", city: "Rockville", postalCode: "20850",
      industry: "biotechnology", confidence: "strong", sourceFamily: "workforce",
      page: 2, pageSize: 100,
    });
  });

  it("filters in SQL and keeps outcome, event, registration, and indication layers distinct", async () => {
    mockedQuery
      .mockResolvedValueOnce([{ category: "opening", count: "2" }] as never)
      .mockResolvedValueOnce([{ count: "2" }] as never)
      .mockResolvedValueOnce([] as never);
    await searchBusinessChange(parseBusinessChangeInput({
      tab: "opening", period: "30", state: "md", county: "24031", industry: "biotechnology",
      source_family: "economic_development",
    }));
    const sql = mockedQuery.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("business_change_outcomes");
    expect(sql).toContain("establishment_events");
    expect(sql).toContain("company_events");
    expect(sql).toContain("business_registrations");
    expect(sql).toContain("business_change_assessments");
    expect(sql).toContain("r.state_code = $2");
    expect(sql).toContain("r.county_fips = $3");
    expect(sql).toContain("r.category = $6");
    expect(sql).not.toContain("recipient_address");
  });

  it("queries explicit coverage and company-establishment relationships", async () => {
    mockedQuery.mockResolvedValueOnce([] as never);
    await getBusinessChangeCoverage();
    expect(String(mockedQuery.mock.calls[0][0])).toContain("business_change_source_coverage");
    mockedQuery.mockReset();
    mockedQuery.mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);
    await getCompanyEstablishmentIntelligence("company-id");
    const sql = mockedQuery.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("business_establishments WHERE company_id=$1");
    expect(sql).toContain("business_change_outcomes WHERE company_id=$1");
    expect(sql).toContain("business_change_assessments WHERE company_id=$1");
  });

  it("renders tabs, source links, coverage disclosure, and coverage-aware empty language", () => {
    const page = readFileSync(resolve(root, "app/business-change/page.tsx"), "utf8");
    expect(page).toContain("Business Change Radar");
    expect(page).toContain("No supported");
    expect(page).toContain("This does not mean no businesses changed");
    expect(page).toContain("target=\"_blank\"");
    expect(page).toContain("location_precision === \"exact_address\"");
    expect(page).toContain("County- and city-level evidence is intentionally not shown as a street-level pin");
  });

  it("adds establishment intelligence to company and establishment profiles", () => {
    const company = readFileSync(resolve(root, "app/company/[slug]/page.tsx"), "utf8");
    const establishment = readFileSync(resolve(root, "app/establishment/[id]/page.tsx"), "utf8");
    expect(company).toContain("Locations and business change");
    expect(company).toContain("Company ≠ establishment");
    expect(establishment).toContain("Physical business location");
    expect(establishment).toContain("Outcome ≠ indication ≠ signal");
    expect(establishment).toContain("Address history");
  });
});
