import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import { query } from "@/lib/db";
import {
  getCompanyEarlyIndicators,
  parseIndicatorInput,
  searchPermitIndicators,
} from "@/lib/indicators";

const mockedQuery = vi.mocked(query);

beforeEach(() => mockedQuery.mockReset());

describe("early indicator queries", () => {
  it("normalizes shareable permit filters", () => {
    const input = parseIndicatorInput({
      state: "md",
      county: "24031",
      min_value: "1000000",
      page: "2",
      page_size: "500",
    });
    expect(input.state).toBe("MD");
    expect(input.county).toBe("24031");
    expect(input.minValue).toBe(1_000_000);
    expect(input.page).toBe(2);
    expect(input.pageSize).toBe(100);
  });

  it("filters permits in PostgreSQL and keeps source links", async () => {
    mockedQuery
      .mockResolvedValueOnce([{ count: "0" }] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{}] as never)
      .mockResolvedValueOnce([] as never);
    await searchPermitIndicators(parseIndicatorInput({ state: "md", county: "24031" }));
    const sql = mockedQuery.mock.calls.map(([statement]) => String(statement)).join("\n");
    expect(sql).toContain("state_code=$1");
    expect(sql).toContain("county_fips=$2");
    expect(sql).toContain("source_url");
    expect(sql).not.toContain("recipient_county_fips");
  });

  it("loads historical assessments separately from underlying evidence", async () => {
    mockedQuery.mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);
    await getCompanyEarlyIndicators("company-id");
    expect(String(mockedQuery.mock.calls[0][0])).toContain("movement_assessments");
    expect(String(mockedQuery.mock.calls[1][0])).toContain("movement_indicators");
  });
});
