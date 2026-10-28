import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn(), withTransaction: vi.fn() }));

import { query } from "@/lib/db";
import { getAlertEvents, getCompanyIntelligenceTimeline, getTrackedCompanies, parseTrackingInput } from "@/lib/tracking";

const mockedQuery = vi.mocked(query);

beforeEach(() => mockedQuery.mockReset());

describe("company tracking queries", () => {
  it("parses tracking filters without mixing recipient and performance geography", () => {
    expect(parseTrackingInput({ state: "va", country: "us", signal_type: "contracts", recency: "30", sort: "priority" })).toEqual({
      industry: undefined,
      state: "VA",
      country: "US",
      reason: undefined,
      signalType: "contracts",
      priority: undefined,
      recency: 30,
      sort: "priority",
    });
  });

  it("uses one union query over canonical event families for the timeline", async () => {
    mockedQuery.mockResolvedValueOnce([] as never);
    await getCompanyIntelligenceTimeline("company-id");
    const sql = String(mockedQuery.mock.calls[0][0]);
    expect(sql).toContain("FROM procurement_events");
    expect(sql).toContain("FROM company_event_companies");
    expect(sql).toContain("FROM permit_company_relationships");
    expect(sql).toContain("UNION ALL");
    expect(sql).not.toContain("INSERT");
    expect(sql).toContain("ec.review_status <> 'rejected'");
    expect(sql).toContain("r.review_status IN ('auto_verified','approved')");
  });

  it("lists tracked companies from the platform registry and keeps coverage source-specific", async () => {
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    mockedQuery.mockResolvedValueOnce([] as never);
    await getTrackedCompanies(parseTrackingInput({}));
    const sql = mockedQuery.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("company_monitor_targets");
    expect(sql).toContain("company_monitor_source_state");
    expect(sql).toContain("permit_company_relationships");
    expect(sql).toContain("review_status IN ('auto_verified','approved')");
    expect(sql).not.toContain("company_watches");
  });

  it("keeps private user-owned alerts out of the public platform alert feed", async () => {
    mockedQuery.mockResolvedValueOnce([] as never);
    await getAlertEvents();
    expect(String(mockedQuery.mock.calls[0][0])).toContain("WHERE a.user_id IS NULL");
  });
});
