import { dateLabel, reported } from "@/lib/format";
import { indicationLabel } from "@/lib/change-intelligence";

const products = [
  ["expansion", "company_expansion"], ["relocation", "company_relocation"],
  ["growth", "company_growth"], ["contraction", "company_contraction"],
] as const;

function place(row: any, prefix: "origin" | "destination") {
  return [row?.[`${prefix}_city`], row?.[`${prefix}_county_fips`], row?.[`${prefix}_state`], row?.[`${prefix}_country`]].filter(Boolean).join(", ");
}

export function ChangeIntelligencePanel({ data }: { data: any }) {
  return <>
    <div className="change-intelligence-grid">
      {products.map(([assessmentType, predictionType]) => {
        const assessment = data.assessments.find((row: any) => row.assessment_type === assessmentType);
        const relevantOutcomes = assessmentType === "expansion" ? ["expansion", "new_facility", "market_entry"] : assessmentType === "contraction" ? ["contraction", "closure"] : [assessmentType];
        const outcome = data.outcomes.find((row: any) => relevantOutcomes.includes(row.outcome_type));
        const prediction = data.predictions.find((row: any) => row.prediction_type === predictionType && row.probability_eligible && row.probability !== null);
        const components = assessment?.components?.items || [];
        return <article className="change-intelligence-card" key={assessmentType}>
          <h3>{assessmentType[0].toUpperCase() + assessmentType.slice(1)}</h3>
          <div className="change-layer"><span>Observed</span>{outcome ? <><strong>{outcome.outcome_type.replaceAll("_", " ")} confirmed</strong><small>{dateLabel(outcome.outcome_date)} · {outcome.verification_status.replaceAll("_", " ")}</small><a href={outcome.source_url} target="_blank" rel="noreferrer">Official evidence ↗</a></> : <strong>No confirmed {assessmentType}</strong>}</div>
          {assessmentType === "relocation" && outcome ? <div className="relocation-route"><span>{reported(place(outcome, "origin"))}</span><b aria-label="to">→</b><span>{reported(place(outcome, "destination"))}</span></div> : null}
          <div className="change-layer"><span>Early indication</span>{assessment ? <><strong>{assessment.score === null ? "Not scored" : `${Number(assessment.score).toFixed(0)} / 100`} · {indicationLabel(assessment.score, assessment.data_sufficiency)}</strong><small>Descriptive evidence score, not a probability · as of {dateLabel(assessment.as_of_date)}</small></> : <><strong>Insufficient evidence</strong><small>No v2 assessment has been generated.</small></>}</div>
          {components.length ? <ul className="change-components">{components.slice(0, 4).map((item: any) => <li key={item.evidence_key}><span>{item.label}</span><strong>+{Number(item.points).toFixed(1)}</strong></li>)}</ul> : null}
          {assessmentType === "relocation" && assessment?.components?.destination && !outcome ? <div className="relocation-route"><span>{reported(Object.values(assessment.components.origin || {}).join(", "))}</span><b aria-label="to">→</b><span>{reported(Object.values(assessment.components.destination).join(", "))}</span></div> : assessmentType === "relocation" && assessment && !outcome ? <small>Relocation activity detected; destination unknown.</small> : null}
          <div className="change-layer"><span>Prediction</span>{prediction ? <><strong>{(Number(prediction.probability) * 100).toFixed(0)}% at {prediction.horizon_days} days</strong><small>{prediction.model_version} · validated probability</small></> : <><strong>Not available</strong><small>Insufficient validated history; probabilities remain hidden.</small></>}</div>
        </article>;
      })}
    </div>
    <details className="coverage-details"><summary>Signal coverage and missing inputs</summary><div className="coverage-list">{data.coverage.map((row: any, index: number) => <div key={`${row.signal_family}-${row.source_system || "none"}-${index}`}><strong>{row.signal_family.replaceAll("_", " ")}</strong><span className={`status-badge status-${row.implementation_status}`}>{row.implementation_status.replaceAll("_", " ")}</span><small>{row.known_limitations}</small></div>)}</div></details>
  </>;
}
