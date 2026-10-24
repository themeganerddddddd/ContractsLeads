import Link from "next/link";

import { compactMoney, dateLabel, reported } from "@/lib/format";
import type { MovementRow } from "@/lib/movements";

function eventLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function jobLabel(row: MovementRow): string {
  if (row.jobs_created != null)
    return `${Number(row.jobs_created).toLocaleString()} announced new`;
  if (row.jobs_affected != null)
    return `${Number(row.jobs_affected).toLocaleString()} reported affected`;
  return "Not reported";
}

function investmentLabel(row: MovementRow): string {
  if (row.capital_investment == null) return "Not reported";
  if (!row.currency || row.currency === "USD")
    return `${compactMoney(row.capital_investment)} announced`;
  return `${row.currency} ${Number(row.capital_investment).toLocaleString()} announced`;
}

export function MovementTable({ rows }: { rows: MovementRow[] }) {
  if (!rows.length)
    return <div className="empty-panel">No movement records match these filters in currently covered sources.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table movement-table">
        <thead>
          <tr>
            <th scope="col">Event date</th>
            <th scope="col">Company / event</th>
            <th scope="col">Type</th>
            <th scope="col">Location</th>
            <th scope="col">Jobs</th>
            <th scope="col">Investment</th>
            <th scope="col">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                {dateLabel(row.effective_start_date || row.announced_date)}
                <small>announced {dateLabel(row.announced_date)}</small>
              </td>
              <td>
                {row.slug ? (
                  <Link className="primary-cell" href={`/company/${row.slug}`}>
                    {row.canonical_name}
                  </Link>
                ) : (
                  <strong className="primary-cell">{row.title}</strong>
                )}
                {row.slug ? <small>{row.title}</small> : null}
                {row.review_status === "pending" ? (
                  <span className="review-pill">Company match pending review</span>
                ) : null}
              </td>
              <td>
                <span className={`status-badge movement-${row.event_type}`}>
                  {eventLabel(row.event_type)}
                </span>
                <small>{eventLabel(row.event_status)}</small>
              </td>
              <td>
                {reported(
                  [row.primary_city, row.primary_county, row.primary_state]
                    .filter(Boolean)
                    .join(", "),
                )}
                {row.primary_county_fips ? <small>FIPS {row.primary_county_fips}</small> : null}
              </td>
              <td>{jobLabel(row)}</td>
              <td>{investmentLabel(row)}</td>
              <td>
                {row.original_url ? (
                  <a className="source-link" href={row.original_url} target="_blank" rel="noreferrer">
                    {row.publisher || "Official source"} ↗
                  </a>
                ) : (
                  "Source unavailable"
                )}
                <small>{reported(row.verification_status?.replaceAll("_", " "))}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
