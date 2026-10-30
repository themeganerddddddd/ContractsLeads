import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import { query } from "@/lib/db";
import { COVERAGE_FAMILIES, getNationalCoverage, STATES } from "@/lib/coverage";

const mockedQuery = vi.mocked(query);

beforeEach(() => mockedQuery.mockReset());

describe("national coverage registry", () => {
  it("represents all 50 states plus DC across every public source family", async () => {
    mockedQuery.mockRejectedValueOnce(new Error("migration not applied"));
    const coverage = await getNationalCoverage();
    expect(STATES).toHaveLength(51);
    expect(coverage.rows).toHaveLength(51 * COVERAGE_FAMILIES.length);
    expect(coverage.registryAvailable).toBe(false);
  });

  it("does not fake uniform local coverage", async () => {
    mockedQuery.mockRejectedValueOnce(new Error("migration not applied"));
    const { rows } = await getNationalCoverage();
    expect(rows.find((row) => row.state_code === "MD" && row.source_family === "warn")?.coverage_status).toBe("active");
    expect(rows.find((row) => row.state_code === "AK" && row.source_family === "warn")?.coverage_status).toBe("planned");
    expect(rows.find((row) => row.state_code === "DC" && row.source_family === "licenses")?.coverage_status).toBe("partial");
  });
});
