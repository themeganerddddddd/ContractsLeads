import Link from "next/link";

export const metadata = { title: "Methodology", description: "How BusinessCurrent separates evidence, signals, assessments, and confirmed outcomes." };

const layers = [
  ["Source observation", "An official record, filing, notice, license, permit, or award exactly as published."],
  ["Event", "A dated source-backed occurrence. An event can remain unmatched to a company or establishment."],
  ["Signal", "Normalized evidence that may support a business-change interpretation."],
  ["Assessment", "A reproducible summary of evidence strength. A score is not a probability."],
  ["Outcome", "A material business change supported by the required evidence and verification rules."],
] as const;

export default function MethodologyPage() {
  return <>
    <section className="page-heading"><p className="eyebrow">BusinessCurrent methodology</p><h1>Evidence before conclusions.</h1><p>BusinessCurrent separates what a source published from what changed, how strong the evidence is, and whether an outcome is confirmed.</p></section>
    <section className="methodology-flow">{layers.map(([name, description], index) => <article key={name}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{name}</h2><p>{description}</p></div></article>)}</section>
    <section className="section split-grid"><div className="panel"><h2>What we do not infer</h2><p>A recipient address is not automatically a headquarters. A permit applicant is not automatically an occupant. A WARN notice does not automatically mean the entire company closed. Missing evidence stays missing.</p><h3>Award adjustment materiality</h3><p>Company-level views promote an adjustment amount only when it is at least 5% of that award’s reference value or at least $1 million USD. The USD threshold is not applied to another currency without a reliable conversion.</p><p>The reference hierarchy is: prior transaction current total, same-transaction current total, award current value, award potential value, then the absolute disclosed total obligation. Zero values are skipped. If no defensible reference exists, the percentage remains unknown and is never invented.</p></div><div className="panel"><h2>Coverage is part of the answer</h2><p>No result can mean no supported event was detected within current coverage—not that no real-world change occurred.</p><Link href="/data-coverage">Review national coverage →</Link></div></section>
  </>;
}
