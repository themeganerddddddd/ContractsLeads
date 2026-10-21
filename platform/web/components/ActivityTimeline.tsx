import { compactMoney, dateLabel, reported } from "@/lib/format";

type TimelineEvent = {
  id: string; event_type: string; event_at: string; title?: string | null; description?: string | null;
  value_delta_native?: string | null; value_native?: string | null; currency?: string | null;
  source_system: string; source_country: string; source_url: string;
};

const labels: Record<string, string> = {
  planned: "Planned", tender_published: "Tender published", tender_updated: "Tender updated",
  tender_closed: "Tender closed", award_announced: "Award announced", contract_signed: "Contract signed",
  contract_started: "Contract started", contract_modified: "Contract modified", value_increased: "Value increased",
  value_decreased: "Value decreased", option_exercised: "Option exercised", contract_completed: "Completed",
  contract_cancelled: "Cancelled", renewal_expected: "Renewal expected", other: "Source update"
};

function amount(event: TimelineEvent): string | null {
  const raw = event.value_delta_native ?? event.value_native;
  if (raw == null) return null;
  if (event.currency === "USD") return compactMoney(raw);
  return `${event.currency || "Native"} ${Number(raw).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <div className="empty-panel">No lifecycle events have been observed yet.</div>;
  return <ol className="activity-timeline">
    {events.map((event) => <li key={event.id}>
      <span className={`event-dot event-${event.event_type}`} aria-hidden="true" />
      <div className="event-heading"><strong>{labels[event.event_type] || event.event_type}</strong><time dateTime={event.event_at}>{dateLabel(event.event_at)}</time></div>
      <p>{reported(event.title || event.description)}</p>
      <div className="event-meta"><span>{event.source_country} · {event.source_system}</span>{amount(event) ? <span>{amount(event)}</span> : null}<a href={event.source_url} target="_blank" rel="noreferrer">Source ↗</a></div>
    </li>)}
  </ol>;
}
