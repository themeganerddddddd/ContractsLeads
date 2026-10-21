import Link from "next/link";
import { compactMoney, dateLabel, reported } from "@/lib/format";

type Award = {
  id: string; title?: string | null; description?: string | null; award_date?: string | null;
  total_obligated?: string | null; current_value?: string | null; potential_value?: string | null;
  canonical_name?: string; company_slug?: string; awarding_agency?: string | null; industry_name?: string | null;
  performance_city?: string | null; performance_state?: string | null; is_demo?: boolean;
  href?: string; source_country?: string; currency?: string | null; prediction_probability?: string | null;
  prediction_sufficiency?: string | null;
};

function valueLabel(row: Award): string {
  const value = row.total_obligated ?? row.current_value ?? row.potential_value;
  if (row.currency && row.currency !== "USD") return value == null ? "Not reported" : `${row.currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return compactMoney(value);
}

export function AwardTable({ rows, compact = false }: { rows: Award[]; compact?: boolean }) {
  if (!rows.length) return <div className="empty-panel">No matching contracts were found.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Date</th><th>Contract</th><th>Company</th><th>Buyer / agency</th><th>Value</th>{compact ? null : <><th>Industry</th><th>Country / work location</th><th>Outlook</th></>}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td>{dateLabel(row.award_date)}</td>
          <td><Link className="primary-cell" href={row.href || `/contract/${row.id}`}>{reported(row.title || row.description)}</Link>{row.is_demo ? <span className="demo-pill">Demo</span> : null}</td>
          <td>{row.company_slug ? <Link href={`/company/${row.company_slug}`}>{reported(row.canonical_name)}</Link> : reported(row.canonical_name)}</td>
          <td>{reported(row.awarding_agency)}</td>
          <td className="numeric">{valueLabel(row)}</td>
          {compact ? null : <><td>{reported(row.industry_name)}</td><td>{reported([row.source_country, row.performance_city, row.performance_state].filter(Boolean).join(" · "))}</td><td>{row.prediction_sufficiency === "sufficient" && row.prediction_probability != null ? `${Math.round(Number(row.prediction_probability) * 100)}%` : "Insufficient history"}</td></>}
        </tr>)}</tbody>
      </table>
    </div>
  );
}
