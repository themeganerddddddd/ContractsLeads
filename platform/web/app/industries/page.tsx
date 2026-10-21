import Link from "next/link";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { query } from "@/lib/db";
import { compactMoney } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Industries" };

export default async function IndustriesPage() {
  try {
    const rows = await query<any>(`SELECT i.slug,i.name,i.description,count(a.id)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity FROM industries i LEFT JOIN awards a ON a.primary_industry_id=i.id AND NOT a.is_benchmark GROUP BY i.id ORDER BY activity DESC NULLS LAST,i.name`);
    return <><section className="page-heading"><p className="eyebrow">Industry taxonomy</p><h1>Federal markets by industry</h1><p>Raw NAICS and PSC remain available alongside this user-facing taxonomy.</p></section><div className="split-grid">{rows.map((row:any)=><article className="panel" key={row.slug}><h2><Link href={`/industry/${row.slug}`}>{row.name}</Link></h2><p>{row.description}</p><strong>{compactMoney(row.activity)}</strong> · {row.awards} awards</article>)}</div></>;
  } catch (cause) { return <><section className="page-heading"><h1>Industries</h1></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>; }
}
