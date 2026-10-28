import type { MovementInput } from "@/lib/movements";

const EVENT_OPTIONS = [
  ["", "All movement types"],
  ["expansion", "Expansion"],
  ["contraction", "Contraction"],
  ["new_facility", "New facility"],
  ["facility_expansion", "Facility expansion"],
  ["headquarters_move", "Headquarters move"],
  ["hiring", "Hiring"],
  ["investment", "Investment"],
  ["layoff", "Layoff"],
  ["closure", "Closure"],
  ["furlough", "Furlough"],
  ["relocation", "Relocation"],
  ["permit", "Permit"],
  ["lease", "Lease"],
  ["funding", "Funding"],
  ["market_entry", "Market entry"],
  ["regulatory_disclosure", "SEC / regulatory disclosure"],
] as const;

function value(input: string | number | undefined): string | number {
  return input ?? "";
}

export function MovementSearchForm({
  input,
  sources,
  industries,
  sourceTypes,
}: {
  input: MovementInput;
  sources: Array<{ source_system: string; name: string }>;
  industries: Array<{ slug: string; name: string }>;
  sourceTypes: string[];
}) {
  return (
    <form className="search-panel movement-search" action="/movements" method="get">
      <div className="query-row movement-query-row">
        <label>
          <span>Company or event</span>
          <input
            name="q"
            defaultValue={value(input.q)}
            placeholder="Company, facility, or announcement…"
          />
        </label>
        <label>
          <span>Event type</span>
          <select name="event_type" defaultValue={value(input.eventType)}>
            {EVENT_OPTIONS.map(([optionValue, label]) => (
              <option value={optionValue} key={optionValue || "all"}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" type="submit">
          Search movements
        </button>
      </div>
      <div className="advanced-grid movement-filter-grid">
        <label>
          Event status
          <select name="event_status" defaultValue={value(input.eventStatus)}>
            <option value="">All statuses</option>
            {[
              "rumored", "inferred", "proposed", "announced", "planned", "filed", "approved",
              "underway", "active", "completed", "rescinded", "cancelled", "unverified",
            ].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
        <label>
          Industry
          <select name="industry" defaultValue={value(input.industry)}>
            <option value="">All linked industries</option>
            {industries.map((industry) => <option key={industry.slug} value={industry.slug}>{industry.name}</option>)}
          </select>
        </label>
        <label>
          State
          <input name="state" maxLength={2} defaultValue={value(input.state)} placeholder="MD" />
        </label>
        <label>
          County or FIPS
          <input name="county" defaultValue={value(input.county)} placeholder="24031" />
        </label>
        <label>
          City
          <input name="city" defaultValue={value(input.city)} />
        </label>
        <label>
          Date from
          <input type="date" name="date_from" defaultValue={value(input.dateFrom)} />
        </label>
        <label>
          Date to
          <input type="date" name="date_to" defaultValue={value(input.dateTo)} />
        </label>
        <label>
          Minimum jobs
          <input type="number" min="0" name="min_jobs" defaultValue={value(input.minJobs)} />
        </label>
        <label>
          Minimum announced investment
          <input type="number" min="0" name="min_investment" defaultValue={value(input.minInvestment)} />
        </label>
        <label>
          Official source
          <select name="source" defaultValue={value(input.source)}>
            <option value="">All available sources</option>
            {sources.map((source) => (
              <option key={source.source_system} value={source.source_system}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source type
          <select name="source_type" defaultValue={value(input.sourceType)}>
            <option value="">All source types</option>
            {sourceTypes.map((sourceType) => <option key={sourceType} value={sourceType}>{sourceType.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label>
          Verification
          <select name="verification_status" defaultValue={value(input.verificationStatus)}>
            <option value="">All verification states</option>
            <option value="source_verified">Source verified</option>
            <option value="corroborated">Corroborated</option>
            <option value="review_required">Review required</option>
          </select>
        </label>
        <label>
          Sort by
          <select name="sort" defaultValue={input.sort}>
            <option value="newest">Newest</option>
            <option value="jobs">Largest job count</option>
            <option value="investment">Largest investment</option>
          </select>
        </label>
      </div>
    </form>
  );
}
