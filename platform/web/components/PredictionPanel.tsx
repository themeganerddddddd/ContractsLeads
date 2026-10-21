type Prediction = {
  prediction_type: string; horizon_days: number; as_of_date: string; probability?: string | null;
  likelihood_band?: string | null; data_sufficiency: string; reasons: string[]; model_version: string;
  notes?: string | null;
};

function title(type: string): string {
  return type === "new_award" ? "New award likelihood" : type === "contract_change" ? "Contract change likelihood" : "Renewal / recompete likelihood";
}

export function PredictionPanel({ predictions }: { predictions: Prediction[] }) {
  return <div className="prediction-grid">
    {predictions.length ? predictions.map((prediction) => {
      const sufficient = prediction.data_sufficiency === "sufficient" && prediction.probability != null;
      return <article className="prediction-card" key={`${prediction.prediction_type}-${prediction.horizon_days}`}>
        <span>{title(prediction.prediction_type)} · {prediction.horizon_days} days</span>
        <strong>{sufficient ? `${Math.round(Number(prediction.probability) * 100)}%` : "Insufficient history"}</strong>
        <small>{sufficient ? `${prediction.likelihood_band} band · as of ${prediction.as_of_date}` : prediction.notes || "Probability withheld until the model passes history and calibration gates."}</small>
        {prediction.reasons?.length ? <ul>{prediction.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
        <footer>Model {prediction.model_version}</footer>
      </article>;
    }) : <article className="prediction-card"><span>Predictive intelligence</span><strong>Insufficient history</strong><small>No eligible point-in-time model has produced a prediction for this record.</small></article>}
  </div>;
}
