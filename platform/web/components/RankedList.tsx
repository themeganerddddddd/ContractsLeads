import Link from "next/link";
import { compactMoney } from "@/lib/format";

type Ranked = { name?: string; canonical_name?: string; slug?: string; company_slug?: string; activity?: string; awards?: string; award_count?: string };

export function RankedList({ rows, route, empty = "No data yet." }: { rows: Ranked[]; route?: "company" | "industry" | "agency"; empty?: string }) {
  if (!rows.length) return <div className="empty-panel">{empty}</div>;
  return <ol className="ranked-list">{rows.map((row, index) => {
    const label = row.canonical_name || row.name || "Not reported";
    const slug = row.slug || row.company_slug;
    return <li key={`${label}-${index}`}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="rank-label">{route && slug ? <Link href={`/${route}/${slug}`}>{label}</Link> : label}<small>{row.awards || row.award_count || 0} awards</small></span><strong>{compactMoney(row.activity)}</strong></li>;
  })}</ol>;
}
