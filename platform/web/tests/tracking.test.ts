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
    expect(sql).toContain("lag(t.current_total_value)");
    expect(sql).toContain("tx.prior_current_total_value");
    expect(sql).toContain("tx.current_total_value");
    expect(sql).toContain("a.current_value");
    expect(sql).toContain("a.potential_value");
    expect(sql).toContain("a.total_obligated");
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

  it("deduplicates tracked procurement alerts and adds material award context", async () => {
    const base = {
      alert_type: "contract_modified", title: "raw title", summary: "raw summary", event_date: "2026-10-29",
      market: "US_FEDERAL", source_type: "procurement_event", source_system: "usaspending",
      source_url: "https://www.usaspending.gov/award/AWARD-1/", match_status: "auto_verified",
      created_at: "2026-10-29T01:00:00Z", seen_at: null, slug: "example-company", canonical_name: "Example Company",
      monitor_target_id: "target-1", company_id: "company-1", raw_source_id: "tx-1", award_id: "award-1",
      adjustment_delta: "-600000", reference_award_value: "10000000", adjustment_currency: "USD",
      modification_number: "P00003",
    };
    mockedQuery.mockResolvedValueOnce([
      { ...base, id: "alert-1", procurement_event_type: "contract_modified" },
      { ...base, id: "alert-2", procurement_event_type: "value_decreased" },
    ] as never);
    const rows = await getAlertEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Example Company award decreased by $600.0K");
    expect(rows[0].summary).toBe("6% of award value");
  });
});
