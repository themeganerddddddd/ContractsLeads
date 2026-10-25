import Link from "next/link";

import { DatabaseNotice } from "@/components/DatabaseNotice";
import { dateLabel, reported } from "@/lib/format";
import { getAlertEvents } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company alerts", description: "Deduplicated source-backed monitoring alerts for tracked companies and regions." };

type RawParams = Record<string, string | string[] | undefined>;
const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function AlertsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const type = scalar(raw.type) || "";
  const company = scalar(raw.company)?.toLowerCase() || "";
  try {
    const allRows = await getAlertEvents();
    const rows = allRows.filter((row) => (!type || row.alert_type === type || row.source_type === type) && (!company || row.canonical_name?.toLowerCase().includes(company)));
    return <>
      <section className="page-heading"><p className="eyebrow">Persistent monitoring events</p><h1>Alerts</h1><p>Deduplicated, source-backed updates generated for platform monitor targets. Email delivery is disabled unless explicitly configured; these records remain available in-app.</p></section>
      <form className="search-panel" action="/alerts" method="get"><div className="advanced-grid"><label>Signal family<select name="type" defaultValue={type}><option value="">All alerts</option><option value="new_award">New awards</option><option value="contract_modified">Contract modifications</option><option value="movement_event">Movements</option><option value="permit_event">Permits</option><option value="sec_filing">SEC</option><option value="saved_search_match">Saved searches</option><option value="region_event">Regions</option></select></label><label>Company<input name="company" defaultValue={company} /></label><button className="button primary" type="submit">Filter alerts</button></div></form>
      <div className="results-toolbar"><div><h2>{rows.length.toLocaleString()} alerts</h2><p>Repeated monitoring runs cannot recreate an alert with the same source-event key.</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">State</th><th scope="col">Company</th><th scope="col">Event</th><th scope="col">Market / source</th><th scope="col">Date</th><th scope="col">Evidence</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.seen_at ? "Seen" : <strong>New</strong>}</td><td>{row.slug ? <Link className="primary-cell" href={`/company/${row.slug}`}>{row.canonical_name}</Link> : reported(row.canonical_name)}</td><td><strong>{row.alert_type.replaceAll("_", " ")}</strong><small>{row.title} · match {reported(row.match_status)}</small></td><td>{reported(row.market)}<small>{row.source_system}</small></td><td>{dateLabel(row.event_date)}</td><td><a href={row.source_url} target="_blank" rel="noreferrer">Official source ↗</a></td></tr>)}</tbody></table></div>
      <p className="notice">Alert generation is active at the data layer. Outbound email remains optional and is not configured by this feature.</p>
    </>;
  } catch (cause) {
    return <><section className="page-heading"><p className="eyebrow">Persistent monitoring events</p><h1>Alerts</h1></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>;
  }
}
