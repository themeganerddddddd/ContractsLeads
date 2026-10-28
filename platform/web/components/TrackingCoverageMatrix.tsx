import { dateLabel } from "@/lib/format";

export function TrackingCoverageMatrix({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="empty-panel">This company is not on the platform monitoring registry.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th scope="col">Source family</th><th scope="col">Status</th><th scope="col">Coverage</th><th scope="col">Last checked</th><th scope="col">Latest new record</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.source_system}>
          <td><a className="primary-cell" href={row.official_url} target="_blank" rel="noreferrer">{row.name} ↗</a><small>{row.source_market}</small></td>
          <td><span className={`status-badge status-${row.status}`}>{row.status.replaceAll("_", " ")}</span><small>{row.status_detail}</small></td>
          <td>{row.coverage || "Entity-linked records in the source market only"}</td>
          <td>{dateLabel(row.last_checked_at)}</td>
          <td>{dateLabel(row.last_new_record_at)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}
