import { DatabaseNotice } from "@/components/DatabaseNotice";
import { MetricCard } from "@/components/MetricCard";
import { Pagination } from "@/components/Pagination";
import { PermitTable } from "@/components/PermitTable";
import { compactMoney } from "@/lib/format";
import { parseIndicatorInput, searchPermitIndicators } from "@/lib/indicators";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Early company indicators",
  description: "Commercial permits and other source-backed early indicators, with conservative company matching and evidence links.",
};

type RawParams = Record<string, string | string[] | undefined>;

export default async function IndicatorsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const input = parseIndicatorInput(raw);
  try {
    const result = await searchPermitIndicators(input);
    return (
      <>
        <section className="page-heading"><p className="eyebrow">Early-warning evidence</p><h1>Early indicators</h1><p>Review commercially meaningful public permits and future source-backed signals. A permit is not a confirmed expansion and does not identify an occupant unless the source explicitly does so.</p></section>
        <div className="metrics-grid"><MetricCard label="Relevant permits" value={Number(result.metrics?.permits || 0).toLocaleString()} note="covered jurisdictions" /><MetricCard label="Declared project value" value={compactMoney(result.metrics?.project_value)} note="not verified spend" /><MetricCard label="New construction" value={Number(result.metrics?.new_construction || 0).toLocaleString()} /><MetricCard label="High-value commercial" value={Number(result.metrics?.high_value || 0).toLocaleString()} /></div>
        <form className="search-panel" action="/indicators" method="get"><div className="advanced-grid"><label>State<input name="state" maxLength={2} defaultValue={input.state || ""} placeholder="MD" /></label><label>County or FIPS<input name="county" defaultValue={input.county || ""} placeholder="24031" /></label><label>City<input name="city" defaultValue={input.city || ""} /></label><label>Classification<select name="classification" defaultValue={input.classification || ""}><option value="">All relevant permits</option>{result.classifications.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label>Minimum declared value<input name="min_value" type="number" min="0" defaultValue={input.minValue ?? ""} /></label><button className="button primary" type="submit">Filter indicators</button></div></form>
        <div className="results-toolbar"><div><h2>{result.total.toLocaleString()} matching permit indicators</h2><p>Database-filtered and paginated. No tenant or beneficiary is inferred from the project address.</p></div></div>
        <PermitTable rows={result.rows} />
        <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={raw} basePath="/indicators" />
        <p className="notice">Current permit coverage: Montgomery County, Maryland commercial building permits. Use is subject to the County&apos;s Open Data Terms, including attribution requirements. The published fields do not include verified occupant, owner, developer, applicant, contractor, or parcel identifiers, so those relationships remain null.</p>
      </>
    );
  } catch (cause) {
    return <><section className="page-heading"><p className="eyebrow">Early-warning evidence</p><h1>Early indicators</h1></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>;
  }
}
