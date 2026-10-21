import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataNote } from "@/components/DataNote";
import { MetricCard } from "@/components/MetricCard";
import { RankedList } from "@/components/RankedList";
import { compactMoney, dateLabel } from "@/lib/format";
import { getLocationSummary } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ state: string; county: string }> }): Promise<Metadata> {
  const { state, county } = await params;
  return { title: `Federal contracts in ${state.toUpperCase()} county ${county}`, description: "Companies based here, work performed here, and federal contracting flows." };
}

export default async function LocationPage({ params }: { params: Promise<{ state: string; county: string }> }) {
  const { state, county } = await params;
  const data = await getLocationSummary(state, county);
  if (!data) notFound();
  const f = data.flows;
  return <>
    <section className="entity-heading"><div className="breadcrumb"><Link href="/locations">Locations</Link><span>/</span><span>{data.state}</span><span>/</span><span>{data.county}</span></div><div className="entity-header-row"><div><p className="eyebrow">County market</p><h1>{data.county}, {data.state}</h1><p>Recipient county FIPS {data.countyFips}. Company location and place of performance are calculated independently.</p></div><DataNote updated={data.lastUpdated} /></div></section>
    <div className="flow-grid"><article className="flow-card"><span>Local → Local</span><strong>{compactMoney(f.local_to_local)}</strong><small>local firms, local work</small></article><article className="flow-card"><span>Local → Outside</span><strong>{compactMoney(f.local_to_outside)}</strong><small>activity exported by local contractors</small></article><article className="flow-card"><span>Outside → Local</span><strong>{compactMoney(f.outside_to_local)}</strong><small>local work by outside firms</small></article><article className="flow-card"><span>Outside → Outside</span><strong>{compactMoney(f.outside_to_outside)}</strong><small>comparison only</small></article></div>
    <section className="section"><div className="section-header"><div><p className="eyebrow">Recipient geography</p><h2>Companies based here</h2><p>Companies whose federal recipient address is in the selected county.</p></div></div><div className="metrics-grid"><MetricCard label="Companies" value={Number(f.local_companies).toLocaleString()} /><MetricCard label="Federal activity won" value={compactMoney(f.won_by_local)} note="disclosed obligations" /><MetricCard label="Activity performed locally" value={compactMoney(f.local_to_local)} /><MetricCard label="Activity exported" value={compactMoney(f.local_to_outside)} /></div><div className="panel"><h2>Largest companies</h2><RankedList rows={data.basedCompanies} route="company" /></div></section>
    <section className="section"><div className="section-header"><div><p className="eyebrow">Performance geography</p><h2>Work performed here</h2><p>Contract work whose primary place of performance is in the selected county.</p></div></div><div className="metrics-grid"><MetricCard label="Contractors" value={Number(f.local_contractors).toLocaleString()} /><MetricCard label="Federal work performed locally" value={compactMoney(f.performed_local)} note="disclosed obligations" /><MetricCard label="Local firms" value={compactMoney(f.local_to_local)} /><MetricCard label="Outside firms" value={compactMoney(f.outside_to_local)} /></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Contract</th><th>Contractor</th><th>Based here?</th><th>Obligation</th></tr></thead><tbody>{data.localWork.map((row:any)=><tr key={row.id}><td>{dateLabel(row.award_date)}</td><td><Link className="primary-cell" href={`/contract/${row.id}`}>{row.title}</Link></td><td><Link href={`/company/${row.company_slug}`}>{row.canonical_name}</Link><small>{[row.recipient_city,row.recipient_state].filter(Boolean).join(", ")}</small></td><td>{row.outside_company ? "Outside firm" : "Local firm"}</td><td className="numeric">{compactMoney(row.total_obligated)}</td></tr>)}</tbody></table></div></section>
    <section className="section split-grid"><div className="panel"><h2>Top agencies</h2><RankedList rows={data.agencies} /></div><div className="panel"><h2>Top industries</h2><RankedList rows={data.industries} route="industry" /></div></section>
    <p className="notice">These figures describe disclosed federal contract obligations. They do not measure total local economic impact.</p>
  </>;
}
