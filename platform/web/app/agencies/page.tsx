import Link from "next/link";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { query } from "@/lib/db";
import { compactMoney } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agencies" };

export default async function AgenciesPage() {
  try {
    const rows = await query<any>(`SELECT ag.slug,ag.name,ag.parent_department,count(a.id)::text AS awards,sum(COALESCE(a.total_obligated,0))::text AS activity FROM agencies ag LEFT JOIN awards a ON a.awarding_agency=ag.name AND NOT a.is_benchmark GROUP BY ag.id ORDER BY activity DESC NULLS LAST`);
    return <><section className="page-heading"><p className="eyebrow">Buying organizations</p><h1>Federal awarding agencies</h1></section><div className="table-wrap"><table className="data-table"><thead><tr><th>Agency</th><th>Department</th><th>Awards</th><th>Disclosed obligations</th></tr></thead><tbody>{rows.map((row:any)=><tr key={row.slug}><td><Link className="primary-cell" href={`/agency/${row.slug}`}>{row.name}</Link></td><td>{row.parent_department}</td><td>{row.awards}</td><td className="numeric">{compactMoney(row.activity)}</td></tr>)}</tbody></table></div></>;
  } catch (cause) { return <><section className="page-heading"><h1>Agencies</h1></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>; }
}
