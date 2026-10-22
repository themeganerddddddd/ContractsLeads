type Momentum = { score: number | null; data_sufficiency: string; components: Record<string, number>; explanation: string; as_of_date: string } | null;

export function MomentumPanel({ momentum }: { momentum: Momentum }) {
  if (!momentum || momentum.score == null) return <article className="momentum-card"><span>Observed-activity index</span><strong>Insufficient history</strong><p>{momentum?.explanation || "No activity-index snapshot is available."}</p></article>;
  return <article className="momentum-card"><span>Observed-activity index · not a probability</span><strong>{momentum.score}<small>/100</small></strong><p>{momentum.explanation}</p><dl>{Object.entries(momentum.components).map(([name, value]) => <div key={name}><dt>{name.replaceAll("_", " ")}</dt><dd>{value}</dd></div>)}</dl><footer>As of {momentum.as_of_date}</footer></article>;
}
