import { DatabaseNotice } from "@/components/DatabaseNotice";
import { dateLabel, reported } from "@/lib/format";
import { getFormationActivity, parseFormationInput, type FormationParams } from "@/lib/change-intelligence";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business formation activity", description: "Source-backed geography and industry business-formation activity." };

export default async function BusinessFormationPage({ searchParams }: { searchParams: Promise<FormationParams> }) {
  const input = parseFormationInput(await searchParams);
  try {
    const data = await getFormationActivity(input);
    return <>
      <section className="page-heading"><p className="eyebrow">Geography × industry intelligence</p><h1>Business Formation Activity</h1><p>Observed official registrations and contextual signals by geography, industry, and month. Activity scores are descriptive and are not probabilities.</p></section>
      <form className="search-panel" action="/business-formation" method="get"><div className="advanced-grid">
        <label>State<select name="state" defaultValue={input.state || ""}><option value="">All states</option>{data.states.map((row) => <option key={row.value} value={row.value}>{row.value}</option>)}</select></label>
        <label>County FIPS<select name="county" defaultValue={input.county || ""}><option value="">All counties</option>{data.counties.map((row) => <option key={row.value} value={row.value}>{row.value}</option>)}</select></label>
        <label>Industry<select name="industry" defaultValue={input.industry || ""}><option value="">All industries</option>{data.industries.map((row) => <option key={row.value} value={row.value}>{row.label || row.value}</option>)}</select></label>
        <label>Month<select name="month" defaultValue={input.month || ""}><option value="">Latest and historical</option>{data.months.map((row) => <option key={row.value} value={row.value}>{dateLabel(row.value)}</option>)}</select></label>
        <button className="button primary" type="submit">Apply filters</button>
      </div></form>
      <div className="results-toolbar"><div><h2>{data.rows.length.toLocaleString()} geography-industry snapshots</h2><p>{data.predictionModel?.probability_eligible ? "A validated formation probability model is available." : "Formation probabilities are unavailable until chronological validation gates pass."}</p></div></div>
      {data.rows.length ? <div className="formation-grid">{data.rows.map((row: any) => <article className="panel" key={`${row.as_of_month}-${row.state_code}-${row.county_fips}-${row.industry_code}`}><p className="eyebrow">{reported([row.state_code, row.county_fips].filter(Boolean).join(" · "))}</p><h2>{row.industry_label || row.industry_code}</h2><strong className="formation-score">{row.formation_score === null ? "Not scored" : `${row.activity_level} · ${Number(row.formation_score).toFixed(0)} / 100`}</strong><p>{row.new_registrations === null ? "Official registration coverage unavailable" : `${Number(row.new_registrations).toLocaleString()} new official registrations`}</p><small>{dateLabel(row.as_of_month)} · {row.data_sufficiency.replaceAll("_", " ")} · not a probability</small></article>)}</div> : <div className="empty-panel">No formation snapshots match these filters. The registration adapter interface is implemented, but no official nationwide source with verified reuse is currently configured.</div>}
      <section className="section"><div className="section-header"><div><p className="eyebrow">Transparent limits</p><h2>Signal coverage</h2></div></div><div className="coverage-list">{data.coverage.map((row: any, index: number) => <div key={`${row.signal_family}-${row.source_system || "none"}-${index}`}><strong>{row.signal_family.replaceAll("_", " ")}</strong><span className={`status-badge status-${row.implementation_status}`}>{row.implementation_status.replaceAll("_", " ")}</span><small>{row.known_limitations}</small></div>)}</div></section>
    </>;
  } catch (cause) {
    return <><section className="page-heading"><p className="eyebrow">Geography × industry intelligence</p><h1>Business Formation Activity</h1></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>;
  }
}
