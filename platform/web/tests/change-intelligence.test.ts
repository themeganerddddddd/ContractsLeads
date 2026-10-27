import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));

import { indicationLabel, parseFormationInput } from "@/lib/change-intelligence";

describe("change intelligence presentation", () => {
  it("labels evidence strength without presenting a probability", () => {
    expect(indicationLabel(null, "insufficient_history")).toBe("Insufficient evidence");
    expect(indicationLabel(22, "limited")).toBe("Limited indication");
    expect(indicationLabel(55, "sufficient")).toBe("Moderate indication");
    expect(indicationLabel(75, "sufficient")).toBe("Strong indication");
  });

  it("normalizes formation filters", () => {
    expect(parseFormationInput({ state: "md", county: "24031", industry: "BIO", month: "2026-10-01" })).toEqual({
      state: "MD", county: "24031", industry: "BIO", month: "2026-10-01",
    });
    expect(parseFormationInput({ month: "October" }).month).toBeUndefined();
  });
});
