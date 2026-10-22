import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import { query } from "@/lib/db";
import { parseSearchInput, searchCompanies, searchContracts } from "@/lib/search";

const mockedQuery = vi.mocked(query);

beforeEach(() => mockedQuery.mockReset());
afterEach(() => vi.useRealTimers());

describe("URL search state", () => {
  it("parses server-side pagination and distinct geography filters", () => {
    const parsed=parseSearchInput({mode:"contracts",page:"3",page_size:"50",recipient_county:"24031",performance_county:"51059",sort:"largest"});
    expect(parsed.page).toBe(3); expect(parsed.pageSize).toBe(50); expect(parsed.recipientCounty).toBe("24031"); expect(parsed.performanceCounty).toBe("51059"); expect(parsed.sort).toBe("largest");
  });
  it("caps page size and normalizes states", () => {
    const parsed=parseSearchInput({page_size:"5000",recipient_state:"md",performance_state:"va"});
    expect(parsed.pageSize).toBe(100); expect(parsed.recipientState).toBe("MD"); expect(parsed.performanceState).toBe("VA");
  });

  it("parses country and explainable-intelligence filters", () => {
    const parsed=parseSearchInput({country:"GB",prediction_min:"0.65",momentum_min:"60"});
    expect(parsed.country).toBe("GB");
    expect(parsed.market).toBe("UK_FTS");
    expect(parsed.predictionMin).toBe(0.65);
    expect(parsed.momentumMin).toBe(60);
  });

  it("keeps recipient and performance state/county predicates separate", async () => {
    mockedQuery.mockResolvedValueOnce([{ count: "0" }] as never).mockResolvedValueOnce([] as never);
    const input=parseSearchInput({
      recipient_state:"md", recipient_county:"24031",
      performance_state:"va", performance_county:"51059"
    });
    await searchContracts(input,"pro");
    const [sql, values] = mockedQuery.mock.calls[0];
    expect(sql).toContain("c.recipient_state = $1");
    expect(sql).toContain("c.recipient_county_fips = $2");
    expect(sql).toContain("a.performance_state = $3");
    expect(sql).toContain("a.performance_county_fips = $4");
    expect(values).toEqual(["MD","24031","VA","51059"]);
  });

  it("applies server pagination after database filtering", async () => {
    mockedQuery.mockResolvedValueOnce([{ count: "200" }] as never).mockResolvedValueOnce([] as never);
    const result=await searchCompanies(parseSearchInput({mode:"companies",page:"3",page_size:"50",industry:"cybersecurity"}),"pro");
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
    const [sql, values] = mockedQuery.mock.calls[1];
    expect(sql).toContain("i.slug = $1");
    expect(sql).toContain("LIMIT $2 OFFSET $3");
    expect(values).toEqual(["cybersecurity",50,100]);
  });

  it("enforces free history and result limits in the query service", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    mockedQuery.mockResolvedValueOnce([{ count: "1483" }] as never).mockResolvedValueOnce([] as never);
    const result=await searchContracts(parseSearchInput({date_from:"2020-01-01",page_size:"100"}),"free");
    expect(result.historyRestricted).toBe(true);
    expect(result.visibleTotal).toBe(20);
    expect(result.resultLimited).toBe(true);
    expect(mockedQuery.mock.calls[0][1]).toEqual(["2026-09-12"]);
    expect(mockedQuery.mock.calls[1][1]).toEqual(["2026-09-12",20,0]);
  });

  it("shows only a five-row performance preview below Pro", async () => {
    mockedQuery.mockResolvedValueOnce([{ count: "25" }] as never).mockResolvedValueOnce([] as never);
    const result=await searchContracts(parseSearchInput({performance_county:"24031"}),"local");
    expect(result.performanceLocked).toBe(true);
    expect(result.visibleTotal).toBe(5);
    expect(result.pageSize).toBe(5);
  });

  it("queries UK processes through the source-neutral process model", async () => {
    mockedQuery.mockResolvedValueOnce([{ count: "1" }] as never).mockResolvedValueOnce([] as never);
    const result=await searchContracts(parseSearchInput({country:"GB",q:"cloud"}),"pro");
    const sql=mockedQuery.mock.calls.map(([statement])=>String(statement)).join("\n");
    expect(sql).toContain("procurement_processes p");
    expect(sql).toContain("p.source_market = $1");
    expect(mockedQuery.mock.calls[0][1]?.[0]).toBe("UK_FTS");
    expect(sql).toContain("'/process/'");
    expect(result.total).toBe(1);
  });

  it("treats TED as a market and applies actual-country and NUTS filters", async () => {
    mockedQuery.mockResolvedValueOnce([{ count: "0" }] as never).mockResolvedValueOnce([] as never);
    const input=parseSearchInput({market:"EU_TED",buyer_country:"deu",supplier_country:"fra",nuts:"de11"});
    await searchContracts(input,"pro");
    expect(input.country).toBe("EU");
    const [sql, values]=mockedQuery.mock.calls[0];
    expect(sql).toContain("p.source_market = $1");
    expect(sql).toContain("p.source_country = $2");
    expect(sql).toContain("c.legal_entity_country = $3");
    expect(sql).toContain("unnest(pl.nuts_codes)");
    expect(values).toEqual(["EU_TED","DEU","FRA","DE11"]);
  });

  it("does not apply prediction filters below Pro", async () => {
    mockedQuery.mockResolvedValueOnce([{ count: "0" }] as never).mockResolvedValueOnce([] as never);
    const result=await searchCompanies(parseSearchInput({mode:"companies",prediction_min:"0.5",momentum_min:"50"}),"local");
    expect(result.intelligenceLocked).toBe(true);
    expect(String(mockedQuery.mock.calls[0][0])).not.toContain("p.probability >=");
  });
});
