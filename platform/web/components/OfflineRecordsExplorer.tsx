import Link from "next/link";
import { MarketFilterBar } from "@/components/MarketFilterBar";
import { archivedSources, archivedCountySuggestions, filterArchivedCompanies, filterArchivedAwards } from "@/lib/offline-snapshot";
import { compactMoney, dateLabel } from "@/lib/format";

export function OfflineRecordsExplorer({
  query="", compact=false, showCompanies=true, showAwards=true,
  state="", county="", country="US",
}: {
  query?:string;compact?:boolean;showCompanies?:boolean;showAwards?:boolean;
  state?:string;county?:string;country?:string;
}) {
  const q=query.trim().slice(0,100);
  const allCompanies=filterArchivedCompanies(q,state,county,country);
  const allAwards=filterArchivedAwards(q,state,county,country);
  const companies=compact?allCompanies.slice(0,8):allCompanies;
  const awards=compact?allAwards.slice(0,8):allAwards;
  return <section className="terminal-archive" aria-label="Archived source records">
    <header className="terminal-archive-heading">
      <div><p className="terminal-eyebrow">SOURCE LIBRARY / DATABASE-FREE</p>
        <h2>{compact?"Historical company reference":"Historical source archive"}</h2>
        <p>Previously collected public records · {dateLabel(archivedSources.lastUpdated)} · Limited Montgomery County, Maryland sample. This is not current nationwide coverage.</p>
      </div><span className="terminal-status-badge">Archived snapshot</span>
    </header>
    {!compact ? <MarketFilterBar action="/public-records" mode="directory"
      values={{q, country, state, county}} knownCounties={archivedCountySuggestions(state)} /> : null}
    {showCompanies ? <section className="terminal-archive-section">
      <div className="terminal-subheading"><div><h3>Companies</h3><p>Source-backed identities, not ranked expansion or retention predictions.</p></div>
        <span>{allCompanies.length} / {archivedSources.companies.length} records</span>
      </div>
      {companies.length ? <div className="terminal-table-scroll"><table className="terminal-table terminal-archive-table">
        <thead><tr><th>#</th><th>Company</th><th>Industry</th><th>Reported location</th><th>Identity evidence</th><th></th></tr></thead>
        <tbody>{companies.map((c,index)=><tr key={c.id}>
          <td className="terminal-rank">{String(index+1).padStart(2,"0")}</td>
          <td className="terminal-company"><Link href={`/public-records/company/${c.id}`}>{c.name}</Link>
            <small>{c.legalName && c.legalName !== c.name?c.legalName:"Company registry"}</small>
          </td><td>{c.sector||"Not reported"}</td>
          <td><strong>{[c.hqCity,c.hqState].filter(Boolean).join(", ")||"Not reported"}</strong><small>{c.hqCounty}</small></td>
          <td>{c.hqVerified?"Verified headquarters":"Local entity record"}<small>{dateLabel(c.verificationDate)}</small></td>
          <td className="terminal-chevron"><Link href={`/public-records/company/${c.id}`} aria-label={`Open ${c.name}`}>↗</Link></td>
        </tr>)}</tbody></table></div>:
        <div className="terminal-empty terminal-empty-small"><strong>No archived companies for this geography.</strong>
          <p>Only a small Montgomery County source sample is stored offline. This does not imply zero businesses in the selected state or county.</p></div>}
    </section> : null}
    {showAwards ? <section className="terminal-archive-section">
      <div className="terminal-subheading"><div><h3>Contract actions</h3><p>Source-linked government obligations and modifications.</p></div>
        <span>{allAwards.length} / {archivedSources.awards.length} records</span>
      </div>
      {awards.length ? <div className="terminal-table-scroll"><table className="terminal-table terminal-archive-table">
        <thead><tr><th>Action date</th><th>Recipient</th><th>Agency</th><th className="numeric">Action amount</th><th>Official source</th></tr></thead>
        <tbody>{awards.map(a=><tr key={a.id}>
          <td>{dateLabel(a.date)}</td>
          <td className="terminal-company"><strong>{a.company}</strong><small>{a.awardId}</small></td>
          <td>{a.agency||"Not reported"}</td><td className="terminal-money">{compactMoney(a.amount)}</td>
          <td>{a.sourceUrl?<a href={a.sourceUrl} target="_blank" rel="noreferrer">View record ↗</a>:"Not linked"}</td>
        </tr>)}</tbody></table></div>:
        <div className="terminal-empty terminal-empty-small"><strong>No archived contract actions match.</strong><p>This limited extract is not a complete record of government business.</p></div>}
    </section> : null}
    <div className="terminal-archive-footer"><span>◌ · Historical only · No likelihood scores</span>
      {compact?<Link href="/public-records">Open source library ↗</Link>:<Link href="/contracts">Search official federal contracts ↗</Link>}
    </div>
  </section>;
}
