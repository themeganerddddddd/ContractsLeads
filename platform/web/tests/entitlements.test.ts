import { describe, expect, it } from "vitest";
import { can, entitlementsFor, historyCutoff, searchResultLimit } from "@/lib/entitlements";

describe("central plan entitlements", () => {
  it("limits free results and history", () => {
    expect(searchResultLimit("free")).toBe(20);
    expect(entitlementsFor("free").history_days).toBe(30);
    expect(historyCutoff("free", new Date("2026-10-12T00:00:00Z"))?.toISOString().slice(0,10)).toBe("2026-09-12");
  });
  it("allows performance search and CSV only on Pro and above", () => {
    expect(can("local","performance_location_search")).toBe(false);
    expect(can("free","csv_export")).toBe(false);
    expect(can("pro","performance_location_search")).toBe(true);
    expect(can("pro","csv_export")).toBe(true);
  });
  it("reserves XLSX for Analyst", () => {
    expect(can("pro","xlsx_export")).toBe(false);
    expect(can("analyst","xlsx_export")).toBe(true);
  });
  it("gates predictions, momentum, and watches at Pro", () => {
    expect(can("local","prediction_filters")).toBe(false);
    expect(can("pro","prediction_filters")).toBe(true);
    expect(can("pro","momentum_filters")).toBe(true);
    expect(can("analyst","company_watches")).toBe(true);
  });
});
