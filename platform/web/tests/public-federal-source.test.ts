import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Source-backed preview fallback", () => {
  it("uses federal contracts, a constrained recency window, and direct official award links", () => {
    const source = read("lib/public-federal-awards.ts");
    expect(source).toContain('award_type_codes: ["A", "B", "C", "D"]');
    expect(source).toContain('date_type: "last_modified_date"');
    expect(source).toContain('https://api.usaspending.gov/api/v2/search/spending_by_award/');
    expect(source).toContain('https://www.usaspending.gov/award/');
    expect(source).toContain('next: { revalidate: 900 }');
    expect(source).not.toContain("probability:");
  });
  it("reports readiness without leaking database connection details or health credentials", () => {
    const status = read("app/api/status/public/route.ts");
    expect(status).toContain("getPublicDataReadiness");
    expect(status).not.toContain("DATABASE_URL");
    expect(status).not.toContain("INTERNAL_HEALTH_TOKEN");
    expect(status).not.toContain("error.message");
  });
});
