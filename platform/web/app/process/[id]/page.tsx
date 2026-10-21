import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { DataNote } from "@/components/DataNote";
import { PredictionPanel } from "@/components/PredictionPanel";
import { dateLabel, reported } from "@/lib/format";
import { getProcessProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

function nativeMoney(value: string | null, currency: string | null): string {
  return value == null ? "Not reported" : `${currency || "Native"} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default async function ProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProcessProfile(id);
  if (!data) notFound();
  const p = data.process;
  return <>
    <section className="entity-heading"><div className="breadcrumb"><Link href="/search?country=GB">Global procurement</Link><span>/</span><span>{p.ocid}</span></div><div className="entity-header-row"><div><p className="eyebrow">{p.source_country} procurement process · {reported(p.current_stage)}</p><h1>{reported(p.title)}</h1><p>{reported(p.buyer_name)}</p><div className="entity-meta"><span className="meta-chip">OCID {reported(p.ocid)}</span><span className="meta-chip">CPV {reported(p.native_category_code)}</span><span className="meta-chip">{reported(p.industry_name)}</span></div></div><div><strong className="price">{nativeMoney(p.value_native, p.currency)}</strong><DataNote updated={data.lastUpdated} source="Find a Tender OCDS" /></div></div></section>
    <nav className="tabs"><a href="#overview">Overview</a><a href="#lifecycle">Lifecycle</a><a href="#intelligence">Predictive intelligence</a><a href="#releases">Source releases</a></nav>
    <section id="overview"><dl className="detail-grid"><div><dt>Buyer</dt><dd>{reported(p.buyer_name)}</dd></div><div><dt>Buyer identifier</dt><dd>{reported([p.buyer_identifier_scheme, p.buyer_identifier_value].filter(Boolean).join(": "))}</dd></div><div><dt>Primary supplier</dt><dd>{p.company_slug ? <Link href={`/company/${p.company_slug}`}>{p.canonical_name}</Link> : "Not reported"}</dd></div><div><dt>Procurement method</dt><dd>{reported(p.procurement_method)}</dd></div><div><dt>Tender deadline</dt><dd>{dateLabel(p.tender_end_at)}</dd></div><div><dt>Contract period</dt><dd>{dateLabel(p.contract_start_date)} — {dateLabel(p.contract_end_date)}</dd></div><div><dt>Native value</dt><dd>{nativeMoney(p.value_native, p.currency)}</dd></div><div><dt>USD comparison</dt><dd>{p.value_usd == null ? "Not shown — no auditable FX observation" : `USD ${Number(p.value_usd).toLocaleString()}`}</dd></div><div><dt>Official source</dt><dd><a href={p.source_url} target="_blank" rel="noreferrer">Open notice ↗</a></dd></div></dl><div className="description-panel"><h2>Description</h2><p>{reported(p.description)}</p><h3>Suppliers</h3><ul>{data.suppliers.map((supplier: any) => <li key={supplier.id}><Link href={`/company/${supplier.slug}`}>{supplier.canonical_name}</Link>{supplier.is_primary ? " · primary" : ""}</li>)}</ul></div></section>
    <section className="section" id="lifecycle"><div className="section-header"><div><p className="eyebrow">OCDS lifecycle</p><h2>Process timeline</h2></div></div><ActivityTimeline events={data.events} /></section>
    <section className="section" id="intelligence"><div className="section-header"><div><p className="eyebrow">Auditable model output</p><h2>Predictive intelligence</h2></div></div><PredictionPanel predictions={data.predictions} /></section>
    <section className="section" id="releases"><div className="section-header"><div><p className="eyebrow">Append-only source history</p><h2>OCDS releases</h2></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Release</th><th>Date</th><th>Stages</th><th>Fetched</th></tr></thead><tbody>{data.releases.map((release: any) => <tr key={`${release.source_release_id}-${release.fetched_at}`}><td><a href={release.source_url} target="_blank" rel="noreferrer">{release.source_release_id}</a></td><td>{dateLabel(release.release_date)}</td><td>{release.tags.join(", ")}</td><td>{dateLabel(release.fetched_at)}</td></tr>)}</tbody></table></div></section>
  </>;
}
