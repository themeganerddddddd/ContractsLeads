import { compactMoney, dateLabel, reported } from "@/lib/format";
import type { IntelligenceTimelineRow } from "@/lib/tracking";

function amount(row: IntelligenceTimelineRow): string | null {
  if (row.value == null) return null;
  if (!row.currency || row.currency === "USD") return compactMoney(row.value);
  return `${row.currency} ${Number(row.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function CompanyIntelligenceTimeline({ rows }: { rows: IntelligenceTimelineRow[] }) {
  if (!rows.length) return <div className="empty-panel">No source-backed procurement or company-intelligence events have been linked.</div>;
  return (
    <ol className="activity-timeline intelligence-timeline">
      {rows.map((row) => (
        <li key={row.id}>
          <span className={`event-dot event-category-${row.category.toLowerCase()}`} aria-hidden="true" />
          <div className="event-heading">
            <strong><span className="timeline-category">{row.category}</span> {row.event_type.replaceAll("_", " ")}</strong>
            <time dateTime={row.event_at}>{dateLabel(row.event_at)}</time>
          </div>
          <p>{reported(row.title || row.summary)}</p>
          <div className="event-meta">
            <span>{row.market} · {row.publisher || row.source_system}</span>
            {amount(row) ? <span>{amount(row)}</span> : null}
            <span>{row.verification_status.replaceAll("_", " ")} · match {row.match_status.replaceAll("_", " ")}</span>
            <span>collected {dateLabel(row.collected_at)}</span>
            <a href={row.source_url} target="_blank" rel="noreferrer">Official source ↗</a>
          </div>
        </li>
      ))}
    </ol>
  );
}
