import Link from "next/link";

import { DatabaseNotice } from "@/components/DatabaseNotice";
import { dateLabel, reported } from "@/lib/format";
import {
  BUSINESS_CHANGE_TABS,
  parseBusinessChangeInput,
  searchBusinessChange,
  type BusinessChangeParams,
  type BusinessChangeRow,
  type BusinessChangeTab,
} from "@/lib/business-change";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Business Change Radar",
  description: "Location-first evidence for businesses opening, growing, moving, closing, shrinking, and forming.",
};

const TAB_LABELS: Record<BusinessChangeTab, string> = {
  opening: "Opening",
  growing: "Growing",
  moving: "Moving",
  closing: "Closing",
  shrinking: "Shrinking",
  "new-businesses": "New Businesses",
};

function tabHref(raw: BusinessChangeParams, tab: BusinessChangeTab): string {
  const params = new URLSearchParams();
  Object.entries(raw).forEach(([key, value]) => {
    const first = Array.isArray(value) ? value[0] : value;
    if (first && key !== "page") params.set(key, first);
  });
  params.set("tab", tab);
  return `/business-change?${params.toString()}`;
}

function viewHref(raw: BusinessChangeParams, view: "cards" | "table"): string {
  const params = new URLSearchParams();
  Object.entries(raw).forEach(([key, value]) => {
    const first = Array.isArray(value) ? value[0] : value;
    if (first && key !== "page" && key !== "view") params.set(key, first);
  });
  params.set("view", view);
  return `/business-change?${params.toString()}`;
}

function placeLabel(row: BusinessChangeRow): string {
  return reported([row.city, row.county, row.state_code, row.postal_code].filter(Boolean).join(", "));
}

function bandLabel(row: BusinessChangeRow): string {
  if (row.band === "confirmed") return "Confirmed";
  if (row.band === "strong") return "Strong indication";
  if (row.band === "moderate") return "Moderate indication";
  if (row.band === "early") return "Early signal";
  if (row.band === "observed") return "Observed source event";
  return row.band.replaceAll("_", " ");
}

function evidenceLinks(row: BusinessChangeRow) {
  const sources = Array.isArray(row.sources) ? row.sources : [];
  const valid = sources.filter((source) => source?.source_url);
  if (!valid.length && row.source_url) {
    valid.push({ source_system: row.source_system || undefined, source_url: row.source_url, label: "Official source" });
  }
  return valid;
}

function MapPanel({ rows }: { rows: BusinessChangeRow[] }) {
  const geocoded = rows.filter((row) =>
    row.location_precision === "exact_address" && Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)),
  );
  if (!geocoded.length) {
    return <aside className="business-change-map empty-map"><p className="eyebrow">Public operating locations only</p><h2>Map</h2><p>No precise public locations are available for these results.</p><p>BusinessCurrent does not place approximate locations on a street-level map. County- and city-level evidence is intentionally not shown as a street-level pin.</p></aside>;
  }
  const latitudes = geocoded.map((row) => Number(row.latitude));
  const longitudes = geocoded.map((row) => Number(row.longitude));
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const position = (row: BusinessChangeRow) => ({
    left: `${10 + ((Number(row.longitude) - minLon) / Math.max(maxLon - minLon, 0.001)) * 80}%`,
    top: `${90 - ((Number(row.latitude) - minLat) / Math.max(maxLat - minLat, 0.001)) * 80}%`,
  });
  return <aside className="business-change-map" aria-label="Precisely geocoded business-change results">
    <div className="map-heading"><div><p className="eyebrow">Public operating locations only</p><h2>Map</h2></div><span>{geocoded.length} precise pins</span></div>
    <div className="map-canvas">
      {geocoded.map((row) => <Link
        className={`map-pin pin-${row.category}`}
        href={row.establishment_id ? `/establishment/${row.establishment_id}` : `#${row.record_id}`}
        key={row.record_id}
        style={position(row)}
        title={`${row.business_name}: ${TAB_LABELS[row.category]}`}
      ><span className="sr-only">{row.business_name}: {TAB_LABELS[row.category]}</span></Link>)}
    </div>
    <p className="map-note">Pins use source-provided precise coordinates. This plot does not infer or geocode missing addresses.</p>
  </aside>;
}

export default async function BusinessChangePage({ searchParams }: { searchParams: Promise<BusinessChangeParams> }) {
  const raw = await searchParams;
  const input = parseBusinessChangeInput(raw);
  const requestedView = Array.isArray(raw.view) ? raw.view[0] : raw.view;
  const view = requestedView === "table" ? "table" : "cards";
  try {
    const result = await searchBusinessChange(input);
    return <>
      <section className="business-change-hero">
        <div><p className="eyebrow">BusinessCurrent Radar</p><h1>Business Change Radar</h1><p>See businesses opening, growing, moving, shrinking, closing, and forming in your market—then inspect the official evidence behind each record.</p></div>
        <Link className="button secondary" href="/data-coverage">View source coverage</Link>
      </section>

      <form className="search-panel" action="/business-change" method="get">
        <input type="hidden" name="tab" value={input.tab} />
        <div className="business-change-primary-filters">
          <label>State<input name="state" defaultValue={input.state || ""} maxLength={2} placeholder="MD" /></label>
          <label>County<input name="county" defaultValue={input.county || ""} placeholder="Montgomery County" /></label>
          <label>City<input name="city" defaultValue={input.city || ""} placeholder="Rockville" /></label>
          <label>Industry<input name="industry" defaultValue={input.industry || ""} placeholder="Biotechnology" /></label>
          <label>Period<select name="period" defaultValue={input.period}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">12 months</option><option value="custom">Custom dates</option></select></label>
          <button className="button primary" type="submit">Search this market</button>
        </div>
        <details className="advanced-filters business-change-advanced"><summary>Advanced filters</summary><div className="advanced-grid"><label>ZIP<input name="postal_code" defaultValue={input.postalCode || ""} inputMode="numeric" /></label><label>From<input type="date" name="date_from" defaultValue={input.dateFrom || ""} /></label><label>To<input type="date" name="date_to" defaultValue={input.dateTo || ""} /></label><label>Confidence<select name="confidence" defaultValue={input.confidence || ""}><option value="">All evidence levels</option><option value="confirmed">Confirmed</option><option value="strong">Strong indication</option><option value="moderate">Moderate indication</option><option value="early">Early / observed</option></select></label><label>Source family<select name="source_family" defaultValue={input.sourceFamily || ""}><option value="">All source families</option><option value="registration">Registration</option><option value="licenses">Licenses</option><option value="facilities_permits">Facilities / permits</option><option value="workforce">Workforce</option><option value="property">Property</option><option value="corporate_capital">Corporate / capital</option><option value="economic_development">Economic development</option><option value="government_business">Government business</option></select></label></div></details>
      </form>

      <nav className="change-tabs" aria-label="Business change categories">
        {BUSINESS_CHANGE_TABS.map((tab) => <Link className={input.tab === tab ? "active" : ""} href={tabHref(raw, tab)} key={tab} aria-current={input.tab === tab ? "page" : undefined}><span>{TAB_LABELS[tab]}</span><strong>{result.counts[tab].toLocaleString()}</strong></Link>)}
      </nav>

      <div className="results-toolbar"><div><h2>{result.total.toLocaleString()} supported {TAB_LABELS[input.tab].toLowerCase()} records</h2><p>Counts reflect the active geography, date, industry, confidence, and source filters—not all business activity in the market.</p></div><div className="view-toggle" aria-label="Result view"><Link className={view === "cards" ? "active" : ""} href={viewHref(raw, "cards")} aria-current={view === "cards" ? "page" : undefined}>Cards</Link><Link className={view === "table" ? "active" : ""} href={viewHref(raw, "table")} aria-current={view === "table" ? "page" : undefined}>Table</Link></div></div>
      <div className="business-change-layout">
        <div className="business-change-results">
          {view === "table" && result.rows.length ? <div className="table-wrap radar-table-wrap"><table className="data-table radar-table"><thead><tr><th scope="col">Company</th><th scope="col">Change</th><th scope="col">Location</th><th scope="col">Industry</th><th scope="col">Evidence</th><th scope="col">Confidence</th><th scope="col">Latest signal</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.record_id}><td>{row.company_slug ? <Link className="primary-cell" href={`/company/${row.company_slug}`}>{row.business_name}</Link> : row.business_name}</td><td><span className={`change-band band-${row.band}`}>{TAB_LABELS[row.category]}</span></td><td>{placeLabel(row)}<small>{row.location_precision.replaceAll("_", " ")}</small></td><td>{reported(row.industry_label)}</td><td>{evidenceLinks(row).length} source{evidenceLinks(row).length === 1 ? "" : "s"}<small>{reported(row.source_family?.replaceAll("_", " "))}</small></td><td>{bandLabel(row)}{row.score !== null ? <small>{Number(row.score).toFixed(0)} / 100 evidence</small> : null}</td><td>{dateLabel(row.record_date)}<small>{row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">View evidence ↗</a> : "Source link unavailable"}</small></td></tr>)}</tbody></table></div> : result.rows.length ? result.rows.map((row) => <article className="change-card" id={row.record_id} key={row.record_id}>
            <div className="change-card-heading"><div><p className="eyebrow">{TAB_LABELS[row.category]} · {row.layer}</p><h2>{row.company_slug ? <Link href={`/company/${row.company_slug}`}>{row.business_name}</Link> : row.establishment_id ? <Link href={`/establishment/${row.establishment_id}`}>{row.business_name}</Link> : row.business_name}</h2></div><span className={`change-band band-${row.band}`}>{bandLabel(row)}</span></div>
            <dl className="change-answers radar-card-summary"><div className="radar-change"><dt>Change</dt><dd>{row.what_changed.replaceAll("_", " ")}</dd></div><div className="radar-place"><dt>Location</dt><dd>{placeLabel(row)} <small>· {row.location_precision.replaceAll("_", " ")}</small></dd></div><div className="radar-date"><dt>Latest signal</dt><dd>{dateLabel(row.record_date)}</dd></div><div className="radar-confidence"><dt>Evidence strength</dt><dd>{row.score !== null ? <>{Number(row.score).toFixed(0)} / 100 <small>evidence score, not probability</small></> : bandLabel(row)}</dd></div></dl>
            {row.category === "moving" ? <div className="move-route"><span>{reported(Object.values(row.origin || {}).filter(Boolean).join(", "))}</span><strong aria-label="to">→</strong><span>{reported(Object.values(row.destination || {}).filter(Boolean).join(", "))}</span></div> : null}
            <div className="evidence-row"><strong>{evidenceLinks(row).length ? `${evidenceLinks(row).length} retained evidence source${evidenceLinks(row).length === 1 ? "" : "s"}` : "Evidence"}</strong>{evidenceLinks(row).length ? <ul>{evidenceLinks(row).map((source, index) => <li key={`${source.source_url}-${index}`}><a href={source.source_url} target="_blank" rel="noreferrer">{source.label || source.source_system || "Official evidence"} ↗</a></li>)}</ul> : <span>No public evidence link was retained for this descriptive indication.</span>}</div>
            <div className="change-card-actions">{row.company_slug ? <Link href={`/company/${row.company_slug}`}>View company →</Link> : row.establishment_id ? <Link href={`/establishment/${row.establishment_id}`}>View location →</Link> : <span />}{row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer">View evidence ↗</a> : null}</div>
            <small>First observed {dateLabel(row.first_observed_at)} · source family {reported(row.source_family?.replaceAll("_", " "))}</small>
          </article>) : <div className="empty-panel radar-empty"><strong>No supported {TAB_LABELS[input.tab].toLowerCase()} signals found</strong><p>This does not mean no businesses changed. Try widening the date range or review source coverage for this market.</p><div><Link href={tabHref({}, input.tab)}>Clear filters</Link><Link href="/data-coverage">View coverage →</Link></div></div>}
        </div>
        <MapPanel rows={result.rows} />
      </div>
      {result.total > result.pageSize ? <nav className="pagination" aria-label="Result pages">{input.page > 1 ? <Link href={`${tabHref(raw, input.tab)}&page=${input.page - 1}`}>← Previous</Link> : <span /> }<span>Page {input.page}</span>{input.page * input.pageSize < result.total ? <Link href={`${tabHref(raw, input.tab)}&page=${input.page + 1}`}>Next →</Link> : <span />}</nav> : null}
    </>;
  } catch (cause) {
    return <><section className="page-heading"><p className="eyebrow">BusinessCurrent Radar</p><h1>Business Change Radar</h1><p>Business-change data is temporarily unavailable. Coverage varies by source and geography.</p></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>;
  }
}
