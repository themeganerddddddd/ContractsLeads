export const AWARD_ADJUSTMENT_MATERIALITY_RATIO = 0.05;
export const AWARD_ADJUSTMENT_ABSOLUTE_USD = 1_000_000;

export type AdjustmentMaterialityStatus = "material" | "immaterial" | "unknown";

export type AdjustmentMateriality = {
  status: AdjustmentMaterialityStatus;
  percent: number | null;
  relativeMaterial: boolean;
  absoluteMaterial: boolean;
};

type MaterialityInput = {
  adjustment: string | number;
  referenceAwardValue?: string | number | null;
  currency?: string | null;
  adjustmentUsd?: string | number | null;
};

function finiteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Evaluate presentation materiality without changing the underlying ledger.
 * Native-currency relative comparisons are valid because the adjustment and
 * award reference share a currency. The absolute threshold is USD-only unless
 * a reliable converted USD adjustment is supplied.
 */
export function evaluateAwardAdjustment(input: MaterialityInput): AdjustmentMateriality {
  const adjustment = finiteNumber(input.adjustment);
  if (adjustment === null) return { status: "unknown", percent: null, relativeMaterial: false, absoluteMaterial: false };

  const absoluteAdjustment = Math.abs(adjustment);
  const reference = finiteNumber(input.referenceAwardValue);
  const positiveReference = reference !== null && Math.abs(reference) > 0 ? Math.abs(reference) : null;
  const percent = positiveReference === null ? null : absoluteAdjustment / positiveReference * 100;
  const relativeMaterial = percent !== null && percent / 100 >= AWARD_ADJUSTMENT_MATERIALITY_RATIO;

  const convertedUsd = finiteNumber(input.adjustmentUsd);
  const usdAdjustment = convertedUsd !== null
    ? Math.abs(convertedUsd)
    : input.currency?.toUpperCase() === "USD"
      ? absoluteAdjustment
      : null;
  const absoluteMaterial = usdAdjustment !== null && usdAdjustment >= AWARD_ADJUSTMENT_ABSOLUTE_USD;

  if (relativeMaterial || absoluteMaterial) {
    return { status: "material", percent, relativeMaterial, absoluteMaterial };
  }
  if (absoluteAdjustment === 0 || positiveReference !== null) {
    return { status: "immaterial", percent, relativeMaterial: false, absoluteMaterial: false };
  }
  return { status: "unknown", percent: null, relativeMaterial: false, absoluteMaterial: false };
}

export function materialityPercentLabel(percent: number | null): string | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(percent)}% of award value`;
}

export const COMMERCIAL_PROCUREMENT_EVENT_LABELS: Record<string, string> = {
  award_announced: "Award announced",
  contract_signed: "Contract signed",
  contract_started: "Contract started",
  contract_modified: "Award adjusted",
  value_increased: "Award increased",
  value_decreased: "Award decreased",
  option_exercised: "Option exercised",
  contract_completed: "Contract completed",
  contract_cancelled: "Contract cancelled",
};

export type ProcurementPresentationRow = {
  id: string;
  category: string;
  event_type: string;
  event_at: string;
  value: string | null;
  currency: string | null;
  source_system: string;
  raw_source_id: string | null;
  award_id: string | null;
  adjustment_delta: string | null;
  reference_award_value: string | null;
  modification_number: string | null;
  materiality_status: AdjustmentMaterialityStatus | null;
  materiality_percent: number | null;
  adjustment_direction: "increase" | "decrease" | null;
  correlated_event_count: number;
};

const CORRELATED_MODIFICATION_TYPES = new Set([
  "contract_modified",
  "value_increased",
  "value_decreased",
  "option_exercised",
]);

function correlationKey(row: ProcurementPresentationRow): string | null {
  if (row.category !== "PROCUREMENT" || !CORRELATED_MODIFICATION_TYPES.has(row.event_type)) return null;
  if (!row.raw_source_id || !row.award_id) return null;
  return `${row.source_system}|${row.raw_source_id}|${row.award_id}`;
}

function firstReported<T>(rows: T[], value: (row: T) => string | null): string | null {
  for (const row of rows) {
    const candidate = value(row);
    if (candidate !== null && candidate !== "") return candidate;
  }
  return null;
}

function presentModificationGroup<T extends ProcurementPresentationRow>(rows: T[]): T {
  const option = rows.find((row) => row.event_type === "option_exercised");
  const valueChange = rows.find((row) => row.event_type === "value_increased" || row.event_type === "value_decreased");
  const modification = rows.find((row) => row.event_type === "contract_modified");
  const base = option || modification || valueChange || rows[0];
  const adjustment = firstReported(rows, (row) => row.adjustment_delta);
  const reference = firstReported(rows, (row) => row.reference_award_value);
  const currency = firstReported(rows, (row) => row.currency);
  const evaluation = adjustment === null ? null : evaluateAwardAdjustment({ adjustment, referenceAwardValue: reference, currency });
  const numericAdjustment = adjustment === null ? null : Number(adjustment);
  const direction = numericAdjustment === null || !Number.isFinite(numericAdjustment) || numericAdjustment === 0
    ? null
    : numericAdjustment > 0 ? "increase" : "decrease";

  let eventType = option ? "option_exercised" : "contract_modified";
  if (!option && evaluation?.status === "material" && direction) {
    eventType = direction === "increase" ? "value_increased" : "value_decreased";
  }

  return {
    ...base,
    event_type: eventType,
    value: evaluation?.status === "material" ? adjustment : null,
    currency,
    adjustment_delta: adjustment,
    reference_award_value: reference,
    modification_number: firstReported(rows, (row) => row.modification_number),
    materiality_status: evaluation?.status || null,
    materiality_percent: evaluation?.percent ?? null,
    adjustment_direction: direction,
    correlated_event_count: rows.length,
  };
}

/** Collapse correlated USAspending lifecycle rows for company-level presentation only. */
export function collapseCompanyProcurementEvents<T extends ProcurementPresentationRow>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  const presentationRows: T[] = [];
  for (const row of rows) {
    const key = correlationKey(row);
    if (!key) {
      presentationRows.push(row);
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  for (const group of groups.values()) presentationRows.push(presentModificationGroup(group));
  return presentationRows.toSorted((left, right) =>
    right.event_at.localeCompare(left.event_at) || right.id.localeCompare(left.id)
  );
}
