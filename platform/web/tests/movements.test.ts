import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import { query } from "@/lib/db";
import {
  getCompanyMovements,
  getLocationMovements,
  parseMovementInput,
  searchMovements,
} from "@/lib/movements";

const mockedQuery = vi.mocked(query);

beforeEach(() => mockedQuery.mockReset());

describe("company movement search", () => {
  it("normalizes geography, pagination, type, and sort state", () => {
    const input = parseMovementInput({
      state: "md",
      county: "24031",
      event_type: "closure",
      min_jobs: "25",
      min_investment: "1000000",
      event_status: "announced",
      verification_status: "source_verified",
      page: "2",
      page_size: "500",
      sort: "jobs",
    });
    expect(input.state).toBe("MD");
    expect(input.county).toBe("24031");
    expect(input.eventType).toBe("closure");
    expect(input.minJobs).toBe(25);
    expect(input.minInvestment).toBe(1_000_000);
    expect(input.eventStatus).toBe("announced");
    expect(input.verificationStatus).toBe("source_verified");
    expect(input.page).toBe(2);
    expect(input.pageSize).toBe(100);
    expect(input.sort).toBe("jobs");
  });

  it("drops unsupported event types", () => {
    expect(parseMovementInput({ event_type: "rumor" }).eventType).toBeUndefined();
  });

  it("keeps movement geography independent and links official evidence", async () => {
    mockedQuery
      .mockResolvedValueOnce([{ count: "1" }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{}] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    await searchMovements(
      parseMovementInput({ state: "md", county: "24031", source: "maryland_warn" }),
    );
    const countSql = String(mockedQuery.mock.calls[0][0]);
    const rowSql = String(mockedQuery.mock.calls[1][0]);
    expect(countSql).toContain("e.primary_state = $1");
    expect(countSql).toContain("e.primary_county_fips = $2");
    expect(countSql).not.toContain("recipient_state");
    expect(rowSql).toContain("s.original_url");
    expect(mockedQuery.mock.calls[0][1]).toEqual(["MD", "24031", "maryland_warn"]);
  });

  it("returns company movements through explicit reviewed associations", async () => {
    mockedQuery.mockResolvedValueOnce([] as never);
    await getCompanyMovements("company-id");
    const [sql, values] = mockedQuery.mock.calls[0];
    expect(String(sql)).toContain("company_event_companies ec");
    expect(String(sql)).toContain("ec.review_status");
    expect(values).toEqual(["company-id"]);
  });

  it("queries county movement geography without procurement address fallbacks", async () => {
    mockedQuery.mockResolvedValueOnce([{}] as never).mockResolvedValueOnce([] as never);
    await getLocationMovements("md", "24031");
    const sql = mockedQuery.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("primary_state=$1");
    expect(sql).toContain("primary_county_fips=$2");
    expect(sql).not.toContain("recipient_county_fips");
    expect(sql).not.toContain("performance_county_fips");
  });
});
