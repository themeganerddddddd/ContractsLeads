import type { CompanySnapshotRow } from "@/lib/company-intelligence";
import { compactMoney } from "@/lib/format";
import { assessProcurementMomentum } from "@/lib/procurement-baseline";

function dollars(value: string | null | undefined) {
  return value == null ? "Not available" : compactMoney(value);
}

export function ProcurementBaselinePanel({ snapshot, newWorkMarkets = [] }: { snapshot: CompanySnapshotRow | null; newWorkMarkets?: {state: string; award_date: string; source_url: string | null}[] }) {
  const current = snapshot?.obligations_12m ?? null;
  const baseline = snapshot?.obligations_baseline_annual ?? null;
  const momentum = assessProcurementMomentum({
    current, annualBaseline: baseline, baselineSupported: snapshot?.baseline_supported === true,
  });
  const pct = momentum.relativeChangePct;
  const deltaLabel = momentum.status === "insufficient" || pct === null
    ? "Insufficient history"
    : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
  const statusCopy = {
    above: "Above normal contract activity",
    below: "Below normal contract activity",
    within: "Near normal contract activity",
    insufficient: "Historical baseline not established",
  }[momentum.status];
  return (
    <section id="contract-baseline" className="fq-contract-baseline">
      <header>
        <div>
          <p className="eyebrow">COMPANY-SPECIFIC CONTRACT CYCLE / THREE-YEAR BASELINE</p>
          <h2>Is this company winning more—or less—than usual?</h2>
          <p>Current 12-month net U.S. obligations compared with the company's own annual average over the preceding three years, not a universal benchmark.</p>
        </div>
        <span className={`fq-momentum-pill fq-momentum-${momentum.status}`}>{statusCopy}</span>
      </header>
      <div className="fq-contract-metrics">
        <div><span>Last 12 months · net obligated</span><strong>{dollars(current)}</strong><small>Positive and negative transactions included</small></div>
        <div><span>Previous 36 months · annual average</span><strong>{momentum.status === "insufficient" ? "—" : dollars(baseline)}</strong><small>Company's own historical run rate</small></div>
        <div><span>Change from normal</span><strong>{deltaLabel}</strong><small>{momentum.difference != null ? `${momentum.difference >= 0 ? "+" : "−"}${compactMoney(String(Math.abs(momentum.difference)))} versus annual baseline` : "Requires at least four years of observable contract history"}</small></div>
        <div><span>New contracts · last 12 months</span><strong>{snapshot?.new_awards_12m ?? "—"}</strong><small>{momentum.status === "insufficient" ? "Prior-cycle count not established" : `Prior 3-year annual avg: ${Number(snapshot?.new_awards_baseline_annual || 0).toFixed(1)}`}</small></div>
      </div>
      <div className="fq-new-markets">
        <div><span className="eyebrow">GEOGRAPHIC DIVERSIFICATION</span><h3>New out-of-state contract performance</h3><p>States appearing on newly awarded contracts in the last 12 months that did not appear in the preceding three years. A government work location is <strong>not</strong> a verified facility or relocation destination.</p></div>
        {newWorkMarkets.length
          ? <ul>{newWorkMarkets.map(row => <li key={row.state}><strong>{row.state}</strong>{row.source_url && /^https:\/\//i.test(row.source_url) ? <a href={row.source_url} target="_blank" rel="noopener noreferrer">Award source ↗</a> : null}</li>)}</ul>
          : <span className="fq-market-none">No new out-of-state work geography identified in these award records.</span>}
      </div>
      <div className="fq-contract-interpretation">
        <strong>{momentum.status === "above"
          ? "Expansion research cue—not a growth prediction."
          : momentum.status === "below"
          ? "Retention research cue—not evidence of contraction."
          : momentum.status === "within" ? "No material deviation detected by this rule." : "No reliable comparison available yet."}</strong>
        <p>{momentum.status === "above"
          ? "A sustained increase may warrant investigation of hiring, facilities, financing and capacity commitments. Contract obligations do not equal company revenue or necessarily imply expansion."
          : momentum.status === "below"
          ? "A decline may reflect a normal recompete, seasonality, delayed federal budget, completed contract, or changes in the scope of work. Corroborate workforce, permits and earnings before treating this as a retention risk."
          : "We show a directional signal only when the difference is at least 25% and $250,000, with enough historical coverage. Missing records and irregular procurement cycles limit interpretation."}</p>
      </div>
    </section>
  );
}
