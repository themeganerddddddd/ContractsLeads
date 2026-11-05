import Link from "next/link";

import { WatchCompanyButton } from "@/components/WatchCompanyButton";
import { indicationLabel } from "@/lib/change-intelligence";
import type { CompanySnapshotRow } from "@/lib/company-intelligence";
import { compactMoney, dateLabel, reported } from "@/lib/format";

function signedMoney(value: string | null) {
  if (value == null) return "Not reported";
  const amount = Number(value);
  const formatted = compactMoney(value);
  return amount > 0 ? `+${formatted}` : formatted;
}

function changeLabel(type: string | null) {
  const labels: Record<string, string> = {
    expansion: "Expansion",
    growth: "Growing",
    relocation: "Moving",
    contraction: "Contraction",
    closure_distress: "Closing risk",
  };
  return type ? labels[type] || type.replaceAll("_", " ") : "No recent change";
}

function latestSignal(row: CompanySnapshotRow) {
  const assessmentIsLatest =
    row.latest_change_date &&
    (!row.latest_transaction_date || row.latest_change_date >= row.latest_transaction_date);
  if (assessmentIsLatest) {
    return {
      label: `${changeLabel(row.latest_change_type)} signal`,
      detail: indicationLabel(
        row.latest_change_score,
        row.latest_change_sufficiency || undefined,
      ),
      date: row.latest_change_date,
    };
  }
  const obligation = Number(row.latest_transaction_obligation);
  return {
    label:
      !row.latest_transaction_material
        ? "Government activity updated"
        : obligation > 0
        ? "Award increased"
        : obligation < 0
          ? "Award decreased"
          : "Government activity updated",
    detail:
      row.latest_transaction_obligation == null
        ? "No recent signal"
        : !row.latest_transaction_material
          ? "Below materiality threshold"
        : signedMoney(row.latest_transaction_obligation),
    date: row.latest_transaction_date,
  };
}

export function CompanyTable({
  rows,
  canTrack = false,
}: {
  rows: CompanySnapshotRow[];
  canTrack?: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="empty-panel">
        <strong>No companies match these filters.</strong>
        <p>Try broadening the geography, change, or money threshold.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap company-table-wrap">
      <table className="data-table company-table">
        <thead>
          <tr>
            <th scope="col">Company</th>
            <th scope="col">Industry</th>
            <th scope="col">Location</th>
            <th scope="col">Latest Change</th>
            <th scope="col">Government Business</th>
            <th scope="col">12M Net Obligations</th>
            <th scope="col">Locations</th>
            <th scope="col">Latest Signal</th>
            <th scope="col">Track</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const signal = latestSignal(row);
            return (
              <tr key={row.id}>
                <td>
                  <Link className="primary-cell" href={`/company/${row.slug}`}>
                    {row.canonical_name}
                  </Link>
                  {row.legal_name !== row.canonical_name ? (
                    <small>{row.legal_name}</small>
                  ) : null}
                </td>
                <td>{reported(row.industry_name)}</td>
                <td>
                  {reported(row.location_label)}
                  <small>{row.location_basis}</small>
                </td>
                <td>
                  <strong>{changeLabel(row.latest_change_type)}</strong>
                  <small>
                    {row.latest_change_score == null
                      ? "No supported change signal"
                      : indicationLabel(
                          row.latest_change_score,
                          row.latest_change_sufficiency || undefined,
                        )}
                  </small>
                </td>
                <td className="numeric money-cell">
                  <strong>{compactMoney(row.government_business)}</strong>
                  <small>Total disclosed U.S. obligations</small>
                </td>
                <td className="numeric money-cell">
                  <strong>{signedMoney(row.obligations_12m)}</strong>
                  <small>Previous 365 days</small>
                </td>
                <td className="numeric">
                  <strong>{Number(row.known_locations).toLocaleString()}</strong>
                  <small>Supported operating locations</small>
                </td>
                <td>
                  <strong>{signal.label}</strong>
                  <small>{signal.detail}</small>
                  <small>{dateLabel(signal.date)}</small>
                </td>
                <td className="company-track-cell">
                  {row.watched ? (
                    <span className="status-badge status-active">Tracked</span>
                  ) : canTrack ? (
                    <WatchCompanyButton companyId={row.id} compact />
                  ) : (
                    <Link className="table-action" href="/pricing#pro">
                      Track
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

