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

export function valueLabel(row: Award): string {
  const candidates = [row.current_value, row.potential_value, row.total_obligated];
  const value = candidates.find((candidate) => candidate !== null && candidate !== undefined && Number(candidate) > 0);
  const hasReportedValue = candidates.some((candidate) => candidate !== null && candidate !== undefined && candidate !== "");
  if (value === undefined) return hasReportedValue ? "Adjusted / no current positive award value reported" : "Not reported";
  if (row.currency && row.currency !== "USD") return `${row.currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return compactMoney(value);
}

export function AwardTable({ rows, compact = false }: { rows: Award[]; compact?: boolean }) {
  if (!rows.length) return <div className="empty-panel">No matching contracts were found.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th scope="col">Date</th><th scope="col">Contract</th><th scope="col">Company</th><th scope="col">Buyer / agency</th><th scope="col">Value</th>{compact ? null : <><th scope="col">Industry</th><th scope="col">Country / work location</th><th scope="col">Outlook</th></>}</tr></thead>
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
