import { dateLabel } from "@/lib/format";

export function DataNote({ updated, demo = false, source = "USAspending" }: { updated?: string | null; demo?: boolean; source?: string }) {
  return (
    <div className="data-note">
      <span className="status-dot" aria-hidden="true" />
      Data last updated {dateLabel(updated)} · Source: {source}
      {demo ? <span className="demo-pill">Includes demo data</span> : null}
    </div>
  );
}
