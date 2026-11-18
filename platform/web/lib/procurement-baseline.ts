/** Observed company procurement momentum, NOT a probability or confirmed business outcome. */
export type ProcurementMomentum = {
  status: "above" | "below" | "within" | "insufficient";
  difference: number | null;
  relativeChangePct: number | null;
};

export function assessProcurementMomentum({
  current,
  annualBaseline,
  baselineSupported,
  relativeThreshold = 0.25,
  absoluteThreshold = 250_000,
}: {
  current: string | number | null | undefined;
  annualBaseline: string | number | null | undefined;
  baselineSupported: boolean;
  relativeThreshold?: number;
  absoluteThreshold?: number;
}): ProcurementMomentum {
  if (!baselineSupported || current == null || annualBaseline == null)
    return { status: "insufficient", difference: null, relativeChangePct: null };
  const latest = Number(current);
  const baseline = Number(annualBaseline);
  if (!Number.isFinite(latest) || !Number.isFinite(baseline) || baseline <= 0)
    return { status: "insufficient", difference: null, relativeChangePct: null };
  const difference = latest - baseline;
  const relativeChangePct = 100 * difference / baseline;
  const material = Math.abs(difference) >= absoluteThreshold && Math.abs(relativeChangePct) >= 100 * relativeThreshold;
  return {
    status: material ? difference > 0 ? "above" : "below" : "within",
    difference,
    relativeChangePct,
  };
}
