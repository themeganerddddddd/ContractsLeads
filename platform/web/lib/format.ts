export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not reported";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not reported";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

export function moneyExact(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not reported";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not reported";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function compactMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Not reported";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Not reported";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(amount);
}

export function dateLabel(value: string | Date | null | undefined): string {
  if (!value) return "Not reported";
  const parsed = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}

export function reported(value: unknown): string {
  return value === null || value === undefined || value === "" ? "Not reported" : String(value);
}
