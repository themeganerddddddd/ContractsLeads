import { describe, expect, it } from "vitest";

import { valueLabel } from "@/components/AwardTable";
import {
  AWARD_ADJUSTMENT_ABSOLUTE_USD,
  AWARD_ADJUSTMENT_MATERIALITY_RATIO,
  collapseCompanyProcurementEvents,
  evaluateAwardAdjustment,
  type ProcurementPresentationRow,
} from "@/lib/procurement-materiality";

function event(eventType: string, adjustment: string | null, reference: string | null = "10000000"): ProcurementPresentationRow {
  return {
    id: `event-${eventType}`,
    category: "PROCUREMENT",
    event_type: eventType,
    event_at: "2026-10-29T00:00:00Z",
    value: adjustment,
    currency: "USD",
    source_system: "usaspending",
    raw_source_id: "transaction-1",
    award_id: "award-1",
    adjustment_delta: adjustment,
    reference_award_value: reference,
    modification_number: "P00003",
    materiality_status: null,
    materiality_percent: null,
    adjustment_direction: null,
    correlated_event_count: 1,
  };
}

describe("award-adjustment materiality", () => {
  it.each([
    ["10000", "10000000"],
    ["-10000", "10000000"],
    ["50000", "500000000"],
  ])("suppresses an immaterial %s adjustment", (adjustment, reference) => {
    expect(evaluateAwardAdjustment({ adjustment, referenceAwardValue: reference, currency: "USD" }).status).toBe("immaterial");
  });

  it.each([
    ["600000", 6],
    ["-600000", 6],
  ])("marks a direction-neutral relative adjustment %s as material", (adjustment, percent) => {
    const result = evaluateAwardAdjustment({ adjustment, referenceAwardValue: "10000000", currency: "USD" });
    expect(result.status).toBe("material");
    expect(result.percent).toBe(percent);
  });

  it.each(["2000000", "-2000000"])("uses the USD absolute threshold for %s", (adjustment) => {
    const result = evaluateAwardAdjustment({ adjustment, referenceAwardValue: "500000000", currency: "USD" });
    expect(result.status).toBe("material");
    expect(result.absoluteMaterial).toBe(true);
  });

  it("keeps a missing denominator unknown without inventing a percentage", () => {
    const result = evaluateAwardAdjustment({ adjustment: "10000", referenceAwardValue: null, currency: "USD" });
    expect(result).toMatchObject({ status: "unknown", percent: null });
  });

  it("keeps zero-dollar modifications visible but amount-free", () => {
    const [presented] = collapseCompanyProcurementEvents([
      event("contract_modified", "0", null),
    ]);
    expect(presented.event_type).toBe("contract_modified");
    expect(presented.materiality_status).toBe("immaterial");
    expect(presented.value).toBeNull();
  });

  it("does not apply the USD threshold to native currency without a conversion", () => {
    const result = evaluateAwardAdjustment({ adjustment: "2000000", referenceAwardValue: "100000000", currency: "EUR" });
    expect(result.status).toBe("immaterial");
    expect(result.absoluteMaterial).toBe(false);
  });

  it("keeps thresholds centralized", () => {
    expect(AWARD_ADJUSTMENT_MATERIALITY_RATIO).toBe(0.05);
    expect(AWARD_ADJUSTMENT_ABSOLUTE_USD).toBe(1_000_000);
  });
});

describe("company timeline procurement presentation", () => {
  it.each([
    ["value_increased", "600000", "value_increased", "increase"],
    ["value_decreased", "-600000", "value_decreased", "decrease"],
  ] as const)("collapses contract_modified + %s into one material event", (valueType, adjustment, expectedType, direction) => {
    const rows = collapseCompanyProcurementEvents([
      event("contract_modified", adjustment),
      event(valueType, adjustment),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_type: expectedType,
      value: adjustment,
      materiality_status: "material",
      materiality_percent: 6,
      adjustment_direction: direction,
      correlated_event_count: 2,
    });
  });

  it.each(["10000", "-10000"])("shows one amount-free adjusted event for immaterial %s", (adjustment) => {
    const valueType = Number(adjustment) > 0 ? "value_increased" : "value_decreased";
    const rows = collapseCompanyProcurementEvents([event("contract_modified", adjustment), event(valueType, adjustment)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: "contract_modified", value: null, materiality_status: "immaterial" });
  });

  it("keeps option exercise meaningful while suppressing its immaterial amount", () => {
    const rows = collapseCompanyProcurementEvents([
      event("contract_modified", "10000"),
      event("value_increased", "10000"),
      event("option_exercised", "10000"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: "option_exercised", value: null, materiality_status: "immaterial" });
  });
});

describe("award table headline value", () => {
  it("prefers positive current value over transaction obligation and potential value", () => {
    expect(valueLabel({ id: "1", total_obligated: "-12483", current_value: "25000000", potential_value: "30000000" })).toBe("$25.0M");
  });

  it("does not call a lone negative deobligation the contract value", () => {
    expect(valueLabel({ id: "1", total_obligated: "-12483", current_value: null, potential_value: null })).toBe(
      "Adjusted / no current positive award value reported",
    );
  });
});
