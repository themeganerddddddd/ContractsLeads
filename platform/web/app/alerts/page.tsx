import Link from "next/link";

import { DatabaseNotice } from "@/components/DatabaseNotice";
import { dateLabel, reported } from "@/lib/format";
import { getAlertEvents, type AlertEventRow } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company alerts", description: "Deduplicated source-backed monitoring alerts for tracked companies and regions." };

type RawParams = Record<string, string | string[] | undefined>;
const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const categoryTerms: Record<string, string[]> = {
  opening: ["opening", "opened", "new_facility", "permit"],
  growth: ["growth", "expansion", "hiring", "investment"],
  move: ["move", "movement", "relocation", "headquarters"],
  contraction: ["contraction", "layoff", "furlough", "warn"],
  closure: ["closure", "closed", "bankruptcy", "dissolution"],
  "new-business": ["formation", "registration", "new_business", "license"],
};

function matchesCategory(row: AlertEventRow, category: string): boolean {
  if (!category) return true;
  const text = [row.alert_type, row.source_type, row.title, row.summary].filter(Boolean).join(" ").toLowerCase();
  return (categoryTerms[category] || [category]).some((term) => text.includes(term));
}

export default async function AlertsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const type = scalar(raw.type) || "";
  const company = scalar(raw.company)?.toLowerCase() || "";
  try {
    const allRows = await getAlertEvents();
    const rows = allRows.filter((row) => matchesCategory(row, type) && (!company || row.canonical_name?.toLowerCase().includes(company)));
    return <>
      <section className="page-heading"><p className="eyebrow">BusinessCurrent inbox</p><h1>Alerts</h1><p>Review source-backed changes for tracked businesses and markets. Every item shows what changed, where it matters, and the evidence that triggered it.</p></section>
      <form className="search-panel alert-filters" action="/alerts" method="get"><div className="advanced-grid"><label>Change type<select name="type" defaultValue={type}><option value="">All</option><option value="opening">Opening</option><option value="growth">Growth</option><option value="move">Move</option><option value="contraction">Contraction</option><option value="closure">Closure</option><option value="new-business">New business</option></select></label><label>Company<input name="company" defaultValue={company} placeholder="Company name" /></label><button className="button primary" type="submit">Filter alerts</button></div></form>
      <div className="results-toolbar"><div><h2>{rows.length.toLocaleString()} alerts</h2><p>{rows.filter((row) => !row.seen_at).length.toLocaleString()} new · deduplicated by source event</p></div></div>
      <div className="alert-inbox">{rows.length ? rows.map((row) => <article className={`alert-card ${row.seen_at ? "" : "unread"}`} key={row.id}><div className="alert-state"><span aria-hidden="true" />{row.seen_at ? "Reviewed" : "New"}</div><div className="alert-content"><div className="alert-heading"><div><p className="eyebrow">{row.alert_type.replaceAll("_", " ")}</p><h2>{row.slug ? <Link href={`/company/${row.slug}`}>{row.canonical_name || row.title}</Link> : reported(row.canonical_name || row.title)}</h2></div><time dateTime={row.event_date || undefined}>{dateLabel(row.event_date)}</time></div><h3>{row.title}</h3><p>{row.summary || "A supported source changed for this tracked business or market."}</p><dl><div><dt>Where</dt><dd>{reported(row.market)}</dd></div><div><dt>Evidence changed</dt><dd>{reported(row.source_type?.replaceAll("_", " "))} · {reported(row.source_system)}</dd></div><div><dt>Match status</dt><dd>{reported(row.match_status?.replaceAll("_", " "))}</dd></div></dl><a href={row.source_url} target="_blank" rel="noreferrer">Review official evidence ↗</a></div></article>) : <div className="empty-panel">No supported alerts match these filters. Coverage varies by source and geography.</div>}</div>
      <p className="notice">Outbound delivery is not enabled by this phase. Alerts remain available in the BusinessCurrent workspace.</p>
    </>;
  } catch (cause) {
    return <><section className="page-heading"><p className="eyebrow">BusinessCurrent inbox</p><h1>Alerts</h1></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>;
  }
}
