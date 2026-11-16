import Link from "next/link";

type Props = {
  variant: "expansion" | "moves" | "contraction" | "companies";
};

const COPY = {
  expansion: {
    label: "Expansion intelligence",
    title: "Expansion ranking is awaiting its source connection",
    body: "No company is promoted without supported investment, capacity, or location evidence.",
    next: "/contracts",
    action: "Review government contracts",
  },
  moves: {
    label: "Movement intelligence",
    title: "Movement ranking is awaiting its source connection",
    body: "Potential destinations stay blank unless a source supports the location claim.",
    next: "/locations",
    action: "Open location research",
  },
  contraction: {
    label: "Retention intelligence",
    title: "Retention ranking is awaiting its source connection",
    body: "Contraction risk is kept separate from confirmed closures, layoffs, and routine contract changes.",
    next: "/business-change",
    action: "Review business changes",
  },
  companies: {
    label: "Company index",
    title: "The live company index is not connected",
    body: "Search controls are ready. Unverified businesses and inferred headquarters are never substituted.",
    next: "/public-records",
    action: "Open source archive",
  },
} as const;

export function RankingsEmptyState({ variant }: Props) {
  const copy = COPY[variant];
  return (
    <section className="bc-empty-state" aria-label={`${copy.label} availability`}>
      <div className="bc-empty-index" aria-hidden="true">{variant === "expansion" ? "01" : variant === "moves" ? "02" : variant === "contraction" ? "03" : "—"}</div>
      <div className="bc-empty-copy" role="status">
        <span>{copy.label}</span>
        <strong>{copy.title}</strong>
        <p>{copy.body}</p>
      </div>
      <div className="bc-empty-actions">
        <Link href={copy.next}>{copy.action}</Link>
        <Link href="/api/status/public">Connection status</Link>
      </div>
    </section>
  );
}
