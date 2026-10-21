import Link from "next/link";
import { AwardTable } from "@/components/AwardTable";
import { DataNote } from "@/components/DataNote";
import { RankedList } from "@/components/RankedList";
import { compactMoney } from "@/lib/format";

export function MarketProfile({ kind, title, description, data }: { kind: "Agency" | "Industry"; title: string; description?: string; data: any }) {
  const maxAnnual = Math.max(...data.annual.map((row:any)=>Number(row.activity)),1);
  return <><section className="entity-heading"><div className="breadcrumb"><Link href={`/${kind.toLowerCase()}s`}>{kind}s</Link><span>/</span><span>{title}</span></div><div className="entity-header-row"><div><p className="eyebrow">{kind} market profile</p><h1>{title}</h1>{description ? <p>{description}</p> : null}</div><DataNote updated={data.lastUpdated} demo /></div></section>
    <section className="section"><div className="section-header"><h2>Recent contracts</h2></div><AwardTable rows={data.recent} compact /></section>
    <section className="section split-grid"><div className="panel"><h2>Largest contractors</h2><RankedList rows={data.contractors} route="company" /></div><div className="panel"><h2>{kind === "Agency" ? "Top industries" : "Top agencies"}</h2><RankedList rows={kind === "Agency" ? data.industries : data.agencies} route={kind === "Agency" ? "industry" : undefined} /></div></section>
    <section className="section split-grid"><div className="panel"><h2>Top recipient locations</h2><RankedList rows={data.recipientLocations.map((row:any)=>({name:[row.county,row.state].filter(Boolean).join(", "),awards:row.awards,activity:row.activity}))} /></div><div className="panel"><h2>Top performance locations</h2><RankedList rows={data.performanceLocations.map((row:any)=>({name:[row.county,row.state].filter(Boolean).join(", "),awards:row.awards,activity:row.activity}))} /></div></section>
    <section className="section panel"><h2>Annual activity</h2><div className="chart-list">{data.annual.map((row:any)=><div className="chart-bar" key={row.year} style={{height:`${Math.max(3,Number(row.activity)/maxAnnual*100)}%`}}><strong>{compactMoney(row.activity)}</strong><span>{row.year}</span></div>)}</div></section>
  </>;
}
