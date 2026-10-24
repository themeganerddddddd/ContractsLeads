import { dateLabel, reported } from "@/lib/format";
import type { EarlyIndicatorData } from "@/lib/indicators";

export function EarlyIndicatorsPanel({ data }: { data: EarlyIndicatorData }) {
  return (
    <div className="indicator-layout">
      <div className="panel">
        <h3>Descriptive indication assessments</h3>
        {data.assessments.length ? (
          <div className="assessment-list">
            {data.assessments.map((assessment) => (
              <article key={`${assessment.assessment_type}-${assessment.state_code || "all"}-${assessment.county_fips || "all"}`}>
                <span>{assessment.assessment_type.replaceAll("_", " ")}</span>
                <strong>{assessment.score == null ? "Insufficient evidence" : `${Number(assessment.score).toFixed(0)}/100`}</strong>
                <p>{assessment.explanation}</p>
                <small>As of {dateLabel(assessment.as_of_date)} · {assessment.model_version} · {assessment.evidence_quality} evidence</small>
              </article>
            ))}
          </div>
        ) : <p>No movement assessment has been generated for this company.</p>}
      </div>
      <div className="panel">
        <h3>Underlying indicators</h3>
        {data.indicators.length ? (
          <ul className="plain-list">
            {data.indicators.map((indicator) => (
              <li key={indicator.id} className="indicator-row">
                <div><strong>{indicator.indicator_type.replaceAll("_", " ")}</strong><small>{reported(indicator.event_title)} · observed {dateLabel(indicator.observed_at)}</small></div>
                {indicator.original_url ? <a href={indicator.original_url} target="_blank" rel="noreferrer">Evidence ↗</a> : null}
              </li>
            ))}
          </ul>
        ) : <p>No conservatively linked early indicators are available.</p>}
      </div>
    </div>
  );
}
