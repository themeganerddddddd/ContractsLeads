import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archivedSources, awardsForArchivedCompany, findArchivedCompany } from "@/lib/offline-snapshot";
import { compactMoney, dateLabel } from "@/lib/format";
type Params={params:Promise<{id:string}>};
export const dynamic="force-dynamic";
export async function generateMetadata({params}:Params):Promise<Metadata>{
 const {id}=await params,company=findArchivedCompany(id);
 return {title:company?`${company.name} — Archived profile`:"Archived profile",robots:{index:false,follow:true}};
}
export default async function ArchivedCompanyPage({params}:Params) {
 const {id}=await params, company=findArchivedCompany(id);
 if(!company) notFound();
 const awards=awardsForArchivedCompany(company);
 return <>
  <div className="offline-profile-breadcrumb"><Link href="/public-records">Public source archive</Link> / {company.name}</div>
  <section className="offline-profile-heading"><p className="studio-section-label">ARCHIVED COMPANY / {dateLabel(archivedSources.lastUpdated)}</p>
    <h1>{company.name}</h1><p>{company.sector} · {[company.hqCity,company.hqState].filter(Boolean).join(", ")}</p>
    <span className="offline-snapshot-status">HISTORICAL · NOT LIVE</span>
  </section>
  <div className="offline-profile-details">
    <div><span>Legal name</span><strong>{company.legalName||"Not reported"}</strong></div>
    <div><span>UEI</span><strong>{company.uei||"Not reported"}</strong></div>
    <div><span>Location verification</span><strong>{company.hqVerified?"Headquarters evidence verified":"Local-entity evidence only"}</strong></div>
    <div><span>Last reviewed</span><strong>{dateLabel(company.verificationDate)}</strong></div>
  </div>
  <div className="offline-profile-actions">
    {company.sourceUrl?<a href={company.sourceUrl} target="_blank" rel="noreferrer" className="button secondary">Location evidence ↗</a>:null}
    {company.website?<a href={company.website} target="_blank" rel="noreferrer" className="button secondary">Company website ↗</a>:null}
    <Link className="button primary" href={`/contracts?recipient=${encodeURIComponent(company.legalName||company.name)}`}>Search current federal contracts ↗</Link>
  </div>
  <section className="offline-profile-records"><h2>Related archived federal actions</h2>
  <p>Matching uses only the exact recipient UEI or legal name. The snapshot contains {archivedSources.awards.length} recent actions, not the company's full government contract history.</p>
  {awards.length?<div className="official-source-table-wrap"><table className="data-table offline-awards-table">
    <thead><tr><th>Action date</th><th>Award ID</th><th>Agency</th><th className="numeric">Recorded amount</th><th>Evidence</th></tr></thead>
    <tbody>{awards.map(row=><tr key={row.id}><td>{dateLabel(row.date)}</td><td>{row.awardId}</td><td>{row.agency}</td><td className="numeric">{compactMoney(row.amount)}</td><td>{row.sourceUrl?<a href={row.sourceUrl} target="_blank" rel="noreferrer">Official ↗</a>:"Not linked"}</td></tr>)}</tbody>
  </table></div>:<div className="empty-panel">No exact-match awards appear in this small snapshot. That does not mean the company has no contracts.</div>}
  </section>
  <Link href="/public-records" className="button secondary">All archived records ↗</Link>
 </>;
}
