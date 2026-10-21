export function MetricCard({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</article>;
}
