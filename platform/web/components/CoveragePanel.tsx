import { dateLabel } from "@/lib/format";
import type { CoverageRow } from "@/lib/movements";

export function CoveragePanel({ coverage }: { coverage: CoverageRow[] }) {
  return (
    <section className="section coverage-panel" id="coverage">
      <div className="section-header">
        <div>
          <p className="eyebrow">Coverage, not completeness</p>
          <h2>What this release actually covers</h2>
          <p>
            The ledger only shows collected official sources. Absence of an event is not evidence that a company has not moved, expanded, or reduced staff.
          </p>
        </div>
      </div>
      <div className="coverage-grid">
        {coverage.map((row) => (
          <article className="coverage-card" key={`${row.source_system}-${row.event_type}-${row.state_code || "all"}`}>
            <div>
              <span className={`status-badge status-${row.coverage_status}`}>{row.coverage_status}</span>
              <span>{[row.country_code, row.state_code].filter(Boolean).join(" · ")}</span>
            </div>
            <h3>{row.name}</h3>
            <p>{row.known_limitations}</p>
            <dl>
              <div><dt>Event family</dt><dd>{row.event_type.replaceAll("_", " ")}</dd></div>
              <div><dt>Coverage from</dt><dd>{dateLabel(row.coverage_start)}</dd></div>
              <div><dt>Collection status</dt><dd>{row.quality_status.replaceAll("_", " ")}</dd></div>
              <div><dt>Last successful run</dt><dd>{dateLabel(row.last_success_at)}</dd></div>
              <div><dt>Reuse status</dt><dd>{row.commercial_use_status?.replaceAll("_", " ") || "unverified"}</dd></div>
              <div><dt>Terms</dt><dd>{row.license_name || "No stated license"}</dd></div>
            </dl>
            <a className="source-link" href={row.official_url} target="_blank" rel="noreferrer">
              Inspect official source ↗
            </a>
          </article>
        ))}
      </div>
      <p className="notice">
        Source terms have not been assumed. Montgomery County data is used under its portal terms, including attribution requirements. SEC states that EDGAR public filing content is free to access and reuse, while WARN and Commerce redistribution remain unverified pending legal review. WARN/ESA rows are publisher-reported notices, not an independent determination that federal WARN thresholds apply. Expansion job and investment figures are announced commitments, not completed outcomes.
      </p>
    </section>
  );
}
