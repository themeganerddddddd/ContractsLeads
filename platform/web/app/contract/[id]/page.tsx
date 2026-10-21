import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { DataNote } from "@/components/DataNote";
import { PredictionPanel } from "@/components/PredictionPanel";
import { compactMoney, dateLabel, money, reported } from "@/lib/format";
import { getContractProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Contract ${id}`, description: `Federal contract lifecycle, transaction history, and explainable intelligence for ${id}.` };
}

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getContractProfile(id);
  if (!data) notFound();
  const a = data.award;
  return <>
    <section className="entity-heading"><div className="breadcrumb"><Link href="/contracts">Contracts</Link><span>/</span><span>{reported(a.piid || a.generated_award_id)}</span></div><div className="entity-header-row"><div><p className="eyebrow">{reported(a.award_type)}</p><h1>{reported(a.title || a.description)}</h1><p>Awarded to <Link href={`/company/${a.company_slug}`}>{a.canonical_name}</Link></p><div className="entity-meta"><span className="meta-chip">PIID {reported(a.piid)}</span><span className="meta-chip">US · USAspending</span><span className="meta-chip">{reported(a.industry_name)}</span>{a.is_demo ? <span className="demo-pill">Demonstration contract</span> : null}</div></div><div><strong className="price">{compactMoney(a.total_obligated)}</strong><DataNote updated={data.lastUpdated} demo={a.is_demo} /></div></div></section>
    <nav className="tabs"><a href="#overview">Overview</a><a href="#lifecycle">Lifecycle</a><a href="#intelligence">Predictive intelligence</a><a href="#transactions">Raw transactions</a></nav>
    <section id="overview"><div className="metrics-grid"><article className="metric-card"><span>Transaction obligation</span><strong>{money(a.total_obligated)}</strong><small>sum disclosed on award record</small></article><article className="metric-card"><span>Current contract value</span><strong>{money(a.current_value)}</strong><small>not interchangeable with obligation</small></article><article className="metric-card"><span>Potential contract value</span><strong>{money(a.potential_value)}</strong><small>including options if reported</small></article><article className="metric-card"><span>Award date</span><strong>{dateLabel(a.award_date)}</strong></article></div>
      <dl className="detail-grid"><div><dt>Company legal name</dt><dd>{reported(a.legal_name)}</dd></div><div><dt>UEI / CAGE</dt><dd>{reported(a.uei)} / {reported(a.cage_code)}</dd></div><div><dt>Parent award</dt><dd>{reported(a.parent_award_id)}</dd></div><div><dt>Awarding agency</dt><dd>{reported(a.awarding_agency)}</dd></div><div><dt>Subagency</dt><dd>{reported(a.awarding_subagency)}</dd></div><div><dt>Industry</dt><dd>{reported(a.industry_name)}</dd></div><div><dt>NAICS</dt><dd>{reported(a.naics)}</dd></div><div><dt>PSC</dt><dd>{reported(a.psc)}</dd></div><div><dt>Performance period</dt><dd>{dateLabel(a.start_date)} — {dateLabel(a.end_date)}</dd></div><div><dt>Recipient address</dt><dd>{reported([a.recipient_address, a.recipient_city, a.recipient_county, a.recipient_state, a.recipient_zip].filter(Boolean).join(", "))}</dd></div><div><dt>Place of performance</dt><dd>{reported([a.performance_city, a.performance_county, a.performance_state, a.performance_zip].filter(Boolean).join(", "))}</dd></div><div><dt>Source last modified</dt><dd>{dateLabel(a.last_modified)}</dd></div></dl>
      <div className="description-panel"><h2>Description</h2><p>{reported(a.description)}</p>{a.source_url ? <p><a className="source-link" href={a.source_url} target="_blank" rel="noreferrer">View federal source ↗</a></p> : <p>Source URL not reported.</p>}</div></section>
    <section className="section" id="lifecycle"><div className="section-header"><div><p className="eyebrow">Derived from official transactions</p><h2>Contract lifecycle</h2></div></div><ActivityTimeline events={data.events} /></section>
    <section className="section" id="intelligence"><div className="section-header"><div><p className="eyebrow">Point-in-time model</p><h2>Contract change outlook</h2></div></div><PredictionPanel predictions={data.predictions} /></section>
    <section className="section" id="transactions"><div className="section-header"><div><p className="eyebrow">Uncollapsed source history</p><h2>Transactions and modifications</h2></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Action date</th><th>Modification</th><th>Action type</th><th>Obligation</th><th>Current total</th><th>Potential total</th><th>Description</th></tr></thead><tbody>{data.transactions.map((tx: any) => <tr key={tx.id}><td>{dateLabel(tx.action_date)}</td><td>{reported(tx.modification_number)}</td><td>{reported(tx.action_type)}</td><td className="numeric">{money(tx.obligation)}</td><td className="numeric">{money(tx.current_total_value)}</td><td className="numeric">{money(tx.potential_total_value)}</td><td>{reported(tx.description)}</td></tr>)}</tbody></table></div></section>
  </>;
}
