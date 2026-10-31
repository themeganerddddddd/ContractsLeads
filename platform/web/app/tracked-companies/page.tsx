import { DatabaseNotice } from "@/components/DatabaseNotice";
import { MetricCard } from "@/components/MetricCard";
import { TrackedCompanyCard } from "@/components/TrackedCompanyCard";
import { getTrackedCompanies, getTrackingOverview, parseTrackingInput, type RawTrackingParams } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tracking", description: "Monitor businesses and the source-backed changes that matter." };

export default async function TrackedCompaniesPage({ searchParams }: { searchParams: Promise<RawTrackingParams> }) {
  const raw = await searchParams;
  const input = parseTrackingInput(raw);
  try {
    const [result, overview] = await Promise.all([getTrackedCompanies(input), getTrackingOverview()]);
    return <>
      <section className="page-heading"><p className="eyebrow">BusinessCurrent workspace</p><h1>Tracking</h1><p>Monitor selected businesses across supported change evidence and government activity. Market and industry tracking are represented in the data model and will join this workspace as coverage expands.</p></section>
      <div className="metrics-grid workspace-metrics"><MetricCard label="Active" value={Number(overview.active_targets || 0).toLocaleString()} note={`${Number(overview.monitor_targets || 0).toLocaleString()} tracked businesses`} /><MetricCard label="High priority" value={Number(overview.high_priority || 0).toLocaleString()} note="active monitoring targets" /><MetricCard label="New signals" value={Number(overview.new_alerts || 0).toLocaleString()} note="unread public monitoring events" /><MetricCard label="Source issues" value={Number(overview.sources_with_errors || 0).toLocaleString()} note="Sources with errors in the current monitoring state" /></div>
      <form className="search-panel tracking-filter" action="/tracked-companies" method="get"><div className="advanced-grid">
        <label>Industry<select name="industry" defaultValue={input.industry || ""}><option value="">All industries</option>{result.industries.map((row) => <option key={row.slug} value={row.slug}>{row.name}</option>)}</select></label>
        <label>Observed recipient state<select name="state" defaultValue={input.state || ""}><option value="">All states</option>{result.states.map((row) => <option key={row.value} value={row.value}>{row.value}</option>)}</select></label>
        <label>Legal entity country<select name="country" defaultValue={input.country || ""}><option value="">All countries</option>{result.countries.map((row) => <option key={row.value} value={row.value}>{row.value}</option>)}</select></label>
        <label>Tracking reason<select name="reason" defaultValue={input.reason || ""}><option value="">All reasons</option>{["manually_added","procurement_activity","movement_signal","permit_signal","sec_signal","saved_search_match","analyst_review","other"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label>Change evidence<select name="signal_type" defaultValue={input.signalType || ""}><option value="">All evidence</option><option value="movements">Business changes</option><option value="permits">Facilities / permits</option><option value="sec">Corporate filings</option><option value="contracts">Government business</option></select></label>
        <label>Priority<select name="priority" defaultValue={input.priority || ""}><option value="">All priorities</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></label>
        <label>Activity recency<select name="recency" defaultValue={input.recency || ""}><option value="">Any time</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label>
        <label>Sort<select name="sort" defaultValue={input.sort}><option value="latest_signal">Latest signal</option><option value="company_name">Company name</option><option value="contract_activity">Contract activity</option><option value="movement_activity">Movement activity</option><option value="recent_change_count">Recent change count</option><option value="priority">Priority</option></select></label>
        <button className="button primary" type="submit">Apply filters</button>
      </div></form>
      <div className="results-toolbar"><div><h2>{result.total.toLocaleString()} tracked businesses</h2><p>Only supported, source-backed signals are shown. Coverage differs by source and geography.</p></div><a href="/alerts">Open alert inbox →</a></div>
      <div className="tracked-company-list">{result.rows.length ? result.rows.map((row) => <TrackedCompanyCard key={row.monitor_target_id} row={row} />) : <div className="empty-panel">No tracked companies match these filters. An analyst can add an exact legal entity from the review workspace.</div>}</div>
      <p className="notice"><strong>BusinessCurrent Beta:</strong> this view shows platform tracking. Personal market watches and saved market views are additive capabilities and do not alter the underlying source record.</p>
    </>;
  } catch (cause) {
    return <><section className="page-heading"><p className="eyebrow">BusinessCurrent workspace</p><h1>Tracking</h1><p>Tracking data is temporarily unavailable.</p></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>;
  }
}
