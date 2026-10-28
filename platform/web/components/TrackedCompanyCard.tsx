import Link from "next/link";

import { dateLabel, reported } from "@/lib/format";
import { indicationLabel } from "@/lib/change-intelligence";

export function TrackedCompanyCard({ row }: { row: any }) {
  const location = [row.recipient_city, row.recipient_state, row.recipient_country].filter(Boolean).join(", ");
  const changes = Number(row.signal_count_30d || 0);
  return (
    <article className="tracked-company-card">
      <header>
        <div>
          <p className="eyebrow">{row.priority} priority · {row.tracking_status.replaceAll("_", " ")}</p>
          <h2><Link href={`/company/${row.slug}`}>{row.canonical_name}</Link></h2>
          <p>{reported(row.industry_name)} · {reported(location)}</p>
        </div>
        <div className="signal-count"><strong>{changes}</strong><span>signals in 30 days</span></div>
      </header>
      <div className="tracking-identifiers">
        <span>UEI {reported(row.uei)}</span><span>CAGE {reported(row.cage_code)}</span><span>CIK {reported(row.cik)}</span>
        <span>Reason {row.tracking_reason.replaceAll("_", " ")}</span>
      </div>
      <div className="indication-summary" aria-label="Company change indications">
        {(["expansion", "relocation", "growth", "contraction"] as const).map((type) => <div key={type}><span>{type}</span><strong>{indicationLabel(row[`${type}_score`], row[`${type}_sufficiency`])}</strong></div>)}
      </div>
      <div className="tracked-signal-grid">
        <div><strong>Contracts</strong><span>{Number(row.award_count || 0).toLocaleString()} U.S. awards</span><small>{row.latest_contract_title || "No procurement event observed"}{row.latest_contract_event ? ` · ${dateLabel(row.latest_contract_event)}` : ""}{row.latest_contract_market ? ` · ${row.latest_contract_market}` : ""}</small></div>
        <div><strong>Workforce / movement</strong><span>{row.latest_movement_title || "No approved movement signal"}</span><small>{row.latest_movement ? `${dateLabel(row.latest_movement)} · ${row.latest_movement_source}` : "Covered sources only"}</small></div>
        <div><strong>Facilities</strong><span>{row.latest_permit_title || "No verified permit relationship"}</span><small>{row.latest_permit ? `${dateLabel(row.latest_permit)} · ${row.latest_permit_source}` : "Unlinked permits stay in Indicators"}</small></div>
        <div><strong>SEC</strong><span>{row.cik ? row.latest_sec_title || "Eligible; no selected filing observed" : "Verified CIK required"}</span><small>{row.latest_sec ? dateLabel(row.latest_sec) : "No supported SEC signal"}</small></div>
      </div>
      <footer>
        <span>Last checked {dateLabel(row.last_checked_at)}</span>
        <span>Last signal {dateLabel(row.last_signal_at)}</span>
        <span>{Number(row.signal_count_7d || 0).toLocaleString()} in 7d</span>
        <span>{Number(row.new_alerts || 0).toLocaleString()} new alerts</span>
        <Link href={`/company/${row.slug}#intelligence-timeline`}>Open intelligence timeline →</Link>
      </footer>
    </article>
  );
}
