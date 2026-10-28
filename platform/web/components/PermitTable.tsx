import { compactMoney, dateLabel, reported } from "@/lib/format";
import type { PermitRow } from "@/lib/indicators";

export function PermitTable({ rows }: { rows: PermitRow[] }) {
  if (!rows.length)
    return <div className="empty-panel">No commercially relevant permits match these filters in covered jurisdictions.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table permit-table">
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Permit</th><th scope="col">Project</th><th scope="col">Location</th><th scope="col">Declared value</th><th scope="col">Why surfaced</th><th scope="col">Evidence</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{dateLabel(row.issue_date || row.application_date)}<small>{reported(row.status)}</small></td>
              <td><strong className="primary-cell">{row.permit_number}</strong><small>{reported(row.work_type)}</small></td>
              <td>{reported(row.description)}<small>{reported(row.use_code)}</small></td>
              <td>{reported([row.address_line, row.city, row.state_code, row.postal_code].filter(Boolean).join(", "))}<small>County FIPS {reported(row.county_fips)}</small></td>
              <td>{row.project_value == null ? "Not reported" : `${compactMoney(row.project_value)} declared`}</td>
              <td><span className="status-badge">{row.relevance_classification.replaceAll("_", " ")}</span><small>Relevance {Math.round(Number(row.relevance_score) * 100)}/100</small></td>
              <td><a className="source-link" href={row.source_url} target="_blank" rel="noreferrer">Official permit record ↗</a><small>Occupant not identified by source</small></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
