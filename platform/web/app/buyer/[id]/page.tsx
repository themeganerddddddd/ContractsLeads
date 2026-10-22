import Link from "next/link";
import { notFound } from "next/navigation";
import { DataNote } from "@/components/DataNote";
import { dateLabel, reported } from "@/lib/format";
import { getBuyerProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export default async function BuyerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getBuyerProfile(id);
  if (!data) notFound();
  const buyer = data.buyer;
  return <>
    <section className="entity-heading"><div className="breadcrumb"><Link href={`/search?market=${buyer.source_market}`}>Global procurement</Link><span>/</span><span>Buyer</span></div><div className="entity-header-row"><div><p className="eyebrow">{buyer.source_market} buyer · {reported(buyer.source_country)}</p><h1>{buyer.name}</h1><p>{reported([buyer.identifier_scheme, buyer.identifier_value].filter(Boolean).join(": "))}</p></div><DataNote updated={data.lastUpdated} source={buyer.source_system} /></div></section>
    <section><dl className="detail-grid"><div><dt>Processes</dt><dd>{Number(buyer.process_count).toLocaleString()}</dd></div><div><dt>First publication</dt><dd>{dateLabel(buyer.first_publication)}</dd></div><div><dt>Latest publication</dt><dd>{dateLabel(buyer.latest_publication)}</dd></div><div><dt>Official source</dt><dd>{buyer.source_url ? <a href={buyer.source_url} target="_blank" rel="noreferrer">Open source ↗</a> : "Not reported"}</dd></div></dl></section>
    <section className="section"><h2>Recent procedures</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Procedure</th><th>Stage</th><th>Published</th><th>Suppliers</th><th>Value</th></tr></thead><tbody>{data.processes.map((p: any) => <tr key={p.id}><td><Link href={`/process/${p.id}`}>{reported(p.title || p.source_process_id)}</Link></td><td>{reported(p.current_stage)}</td><td>{dateLabel(p.published_at)}</td><td>{p.supplier_count}</td><td>{p.value_native == null ? "Not reported" : `${p.currency || "Native"} ${Number(p.value_native).toLocaleString()}`}</td></tr>)}</tbody></table></div></section>
    <section className="section"><h2>Frequent suppliers</h2><ul>{data.suppliers.map((supplier: any) => <li key={supplier.slug}><Link href={`/company/${supplier.slug}`}>{supplier.canonical_name}</Link> · {supplier.process_count} processes</li>)}</ul></section>
  </>;
}
