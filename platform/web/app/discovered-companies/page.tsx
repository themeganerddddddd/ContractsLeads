import Link from "next/link";

import { DatabaseNotice } from "@/components/DatabaseNotice";
import { dateLabel, reported } from "@/lib/format";
import { getDiscoveredCompanies } from "@/lib/tracking";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discovered companies", description: "Companies surfaced from new source-backed procurement and movement evidence." };

export default async function DiscoveredCompaniesPage() {
  try {
    const rows = await getDiscoveredCompanies();
    return <>
      <section className="page-heading"><p className="eyebrow">Automatic source discovery</p><h1>Discovered companies</h1><p>New procurement and company-movement evidence awaiting analyst attention. Discovery does not make a company a platform monitor target or a personal watch.</p></section>
      <div className="results-toolbar"><div><h2>{rows.length.toLocaleString()} discovery records</h2><p>Ambiguous and pending matches remain in the review flow.</p></div><Link href="/admin/company-match-reviews">Open analyst workspace →</Link></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">Company</th><th scope="col">Why surfaced</th><th scope="col">Date</th><th scope="col">Match</th><th scope="col">Evidence</th><th scope="col">Tracking</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.slug ? <Link className="primary-cell" href={`/company/${row.slug}`}>{row.canonical_name}</Link> : <strong>{reported(row.observed_company_name)}</strong>}<small>{row.legal_name || "No authoritative legal entity linked"}</small></td><td>{row.discovery_reason.replaceAll("_", " ")}<small>{row.source_system} · {reported(row.evidence?.event_type)}</small></td><td>{dateLabel(row.event_date)}</td><td><span className={`status-badge status-${row.match_status}`}>{row.match_status.replaceAll("_", " ")}</span><small>{row.discovery_status.replaceAll("_", " ")}</small></td><td><a href={row.source_url} target="_blank" rel="noreferrer">Official source ↗</a></td><td>{row.tracking_status ? <span className="status-badge status-active">{row.tracking_status}</span> : row.company_id ? <span>Available for analyst promotion</span> : <span>Resolve entity first</span>}</td></tr>)}</tbody></table></div>
      <p className="notice">BAE Systems and other shared-brand records remain ambiguous until an analyst selects the correct legal entity and official identifier. Name similarity alone never starts monitoring.</p>
    </>;
  } catch (cause) {
    return <><section className="page-heading"><p className="eyebrow">Automatic source discovery</p><h1>Discovered companies</h1></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>;
  }
}
