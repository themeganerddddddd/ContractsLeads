import { compactMoney, dateLabel, reported } from "@/lib/format";
import { COMMERCIAL_PROCUREMENT_EVENT_LABELS, materialityPercentLabel } from "@/lib/procurement-materiality";
import type { IntelligenceTimelineRow } from "@/lib/tracking";

function amount(row: IntelligenceTimelineRow): string | null {
  if (row.value == null) return null;
  const value = row.materiality_status === "material" && row.adjustment_direction
    ? Math.abs(Number(row.value))
    : row.value;
  if (!row.currency || row.currency === "USD") return compactMoney(value);
  return `${row.currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function CompanyIntelligenceTimeline({ rows }: { rows: IntelligenceTimelineRow[] }) {
  if (!rows.length) return <div className="empty-panel">No source-backed procurement or company-intelligence events have been linked.</div>;
  return (
    <ol className="activity-timeline intelligence-timeline">
      {rows.map((row) => {
        const displayAmount = amount(row);
        const percentage = materialityPercentLabel(row.materiality_percent);
        const isMaterialAdjustment = row.materiality_status === "material" && row.adjustment_direction !== null;
        const direction = row.adjustment_direction === "increase" ? "increased" : "decreased";
        const label = row.category === "PROCUREMENT"
          ? COMMERCIAL_PROCUREMENT_EVENT_LABELS[row.event_type] || "Government business updated"
          : row.event_type.replaceAll("_", " ");
        return <li key={row.id}>
          <div className="timeline-date">
            <time dateTime={row.event_at}>{dateLabel(row.event_at)}</time>
            <span>{row.category === "PROCUREMENT" ? "Government" : row.category.toLowerCase()}</span>
          </div>
          <span className={`event-dot event-category-${row.category.toLowerCase()}`} aria-hidden="true" />
          <div className="timeline-body">
            <div className="event-heading"><strong>{label}</strong></div>
            <p>{reported(row.title || row.summary)}</p>
            <div className="event-meta">
              <span>{row.market} · {row.publisher || row.source_system}</span>
              {isMaterialAdjustment && displayAmount
                ? <strong className={`material-adjustment material-adjustment-${row.adjustment_direction}`}>
                    {row.event_type === "option_exercised" ? `Award value ${direction} by ${displayAmount}` : `${direction[0].toUpperCase()}${direction.slice(1)} by ${displayAmount}`}
                  </strong>
                : displayAmount ? <span>{displayAmount}</span> : null}
              {isMaterialAdjustment && percentage ? <span>{percentage}</span> : null}
              {row.modification_number ? <span>Modification {row.modification_number}</span> : null}
              {row.materiality_status === "immaterial" && row.event_type === "contract_modified" ? <span className="minor-adjustment">Minor contract modification</span> : null}
              <span>{row.verification_status.replaceAll("_", " ")} · match {row.match_status.replaceAll("_", " ")}</span>
              <span>collected {dateLabel(row.collected_at)}</span>
              <a href={row.source_url} target="_blank" rel="noreferrer">Official source ↗</a>
            </div>
          </div>
        </li>
      })}
    </ol>
  );
}
