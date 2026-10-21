import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import { query } from "@/lib/db";
import { getCompanyProfile, getHomeOverview, getLocationSummary } from "@/lib/profiles";

const mockedQuery = vi.mocked(query);

beforeEach(() => mockedQuery.mockReset());

describe("profile aggregate SQL", () => {
  it("calculates home totals independently of the limited lists", async () => {
    mockedQuery
      .mockResolvedValueOnce([{ companies: "100", awards: "200", activity: "300", states: "4" }] as never)
      .mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ updated: "2026-10-12" }] as never);
    const result = await getHomeOverview();
    expect(result.metrics.awards).toBe("200");
    expect(mockedQuery.mock.calls[0][0]).not.toContain("LIMIT");
    expect(mockedQuery.mock.calls[1][0]).toContain("LIMIT 6");
  });

  it("uses transaction-based annual company aggregates", async () => {
    mockedQuery.mockResolvedValueOnce([{ id: "company-id" }] as never);
    for (let index=0; index<6; index++) mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([{ updated: null }] as never);
    await getCompanyProfile("company");
    expect(mockedQuery.mock.calls.some(([sql]) => String(sql).includes("annual_company_activity"))).toBe(true);
  });

  it("keeps recipient and performance county predicates distinct on location pages", async () => {
    mockedQuery.mockResolvedValueOnce([{ county: "Montgomery County" }] as never);
    mockedQuery.mockResolvedValueOnce([{}] as never);
    for (let index=0; index<4; index++) mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([{ updated: null }] as never);
    await getLocationSummary("md", "24031");
    const sql = mockedQuery.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("c.recipient_county_fips=$2");
    expect(sql).toContain("a.performance_county_fips=$2");
    expect(sql).toContain("NOT a.is_benchmark");
  });
});
