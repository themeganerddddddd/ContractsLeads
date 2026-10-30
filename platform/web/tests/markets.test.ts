import { describe, expect, it } from "vitest";

import { parseMarketQuery } from "@/lib/markets";

describe("market search", () => {
  it("accepts ZIP and state without FIPS knowledge", () => {
    expect(parseMarketQuery("20850").radarParams.get("postal_code")).toBe("20850");
    expect(parseMarketQuery("Maryland").radarParams.get("state")).toBe("MD");
  });

  it("distinguishes county and city labels", () => {
    const county = parseMarketQuery("Montgomery County, MD");
    const city = parseMarketQuery("Rockville, MD");
    expect(county.kind).toBe("county");
    expect(county.radarParams.get("county")).toBe("Montgomery County");
    expect(city.kind).toBe("city");
    expect(city.radarParams.get("city")).toBe("Rockville");
  });
});
