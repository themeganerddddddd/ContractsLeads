import Link from "next/link";
import { archivedSources, filterArchivedCompanies, filterArchivedAwards } from "@/lib/offline-snapshot";
import { compactMoney, dateLabel } from "@/lib/format";

export function OfflineRecordsExplorer({
  query="", compact=false, showCompanies=true, showAwards=true,
}: {query?:string;compact?:boolean;showCompanies?:boolean;showAwards?:boolean}) {
  const q=query.trim().slice(0,100);
  const allCompanies=filterArchivedCompanies(q), allAwards=filterArchivedAwards(q);
  const companies=compact?allCompanies.slice(0,5):allCompanies;
  const awards=compact?allAwards.slice(0,6):allAwards;
  return <section className="offline-archive" aria-label="Archived public-source records">
    <header className="offline-archive-intro"><div>
      <p className="studio-section-label">PUBLIC SOURCE ARCHIVE / NO DATABASE REQUIRED</p>
      <h2>{compact ? "Explore existing company records" : "Montgomery County source archive"}</h2>
      <p>Previously collected records, last updated {dateLabel(archivedSources.lastUpdated)}. This is a small Montgomery County, Maryland snapshot—not live national coverage.</p>
    </div><span className="offline-snapshot-status">ARCHIVED · NOT LIVE</span></header>
    {!compact ? <form action="/public-records" method="get" className="offline-search" role="search">
      <label htmlFor="archive-query">Find companies, agencies and award IDs</label>
      <div><input name="q" id="archive-query" defaultValue={q} placeholder="Search existing source records"/><button className="button primary" type="submit">Search archive</button>{q ? <Link href="/public-records" className="button secondary">Clear</Link> : null}</div>
    </form> : null}
    {showCompanies ? <div className="offline-archive-group">
      <div className="offline-archive-group-title"><h3>Company registry</h3><span>{allCompanies.length} of {archivedSources.companies.length} records</span></div>
      {companies.length ? <div className="offline-company-grid">{companies.map(c=><Link className="offline-company-card" href={`/public-records/company/${c.id}`} key={c.id}>
        <strong>{c.name}</strong><span>{c.sector || "Sector not reported"}</span>
        <small>{[c.hqCity,c.hqState].filter(Boolean).join(", ")} · {c.hqVerified ? "Headquarters source verified" : "Local-entity record"}</small>
        <b>View archived profile ↗</b>
      </Link>)}</div> : <div className="empty-panel">No company matches in this limited sample.</div>}
    </div> : null}
    {showAwards ? <div className="offline-archive-group">
      <div className="offline-archive-group-title"><h3>Recent archived federal actions</h3><span>{allAwards.length} of {archivedSources.awards.length} records</span></div>
      {awards.length ? <div className="official-source-table-wrap"><table className="data-table offline-awards-table"><thead>
        <tr><th>Date</th><th>Recipient / contract</th><th>Agency</th><th className="numeric">Recorded amount</th><th>Source</th></tr>
      </thead><tbody>{awards.map(row=><tr key={row.id}>
        <td>{dateLabel(row.date)}</td><td><strong>{row.company}</strong><small>{row.awardId}{row.description ? ` · ${row.description}` : ""}</small></td>
        <td>{row.agency || "Not reported"}</td><td className="numeric">{compactMoney(row.amount)}</td>
        <td>{row.sourceUrl ? <a href={row.sourceUrl} target="_blank" rel="noreferrer">Official ↗</a> : "Not linked"}</td>
      </tr>)}</tbody></table></div> : <div className="empty-panel">No award matches in this limited sample.</div>}
      <p className="offline-footnote">Reported amounts are individual award actions, including negative adjustments—not company revenue, lifetime award totals or expansion predictions.</p>
    </div> : null}
    {compact ? <div className="offline-bottom"><Link href={`/public-records${q?`?q=${encodeURIComponent(q)}`:""}`}>Browse the complete archived snapshot ↗</Link></div> : null}
  </section>;
}
