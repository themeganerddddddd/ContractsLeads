import Link from "next/link";

type Props = {
  variant: "expansion" | "moves" | "contraction" | "companies";
};

/** Explicit, non-fabricated empty data state. Decorative rows are intentionally blank. */
export function RankingsEmptyState({variant}:Props) {
  const isCompanies=variant==="companies";
  const title = variant==="expansion" ? "Expansion" : variant==="moves" ? "Movement" : variant==="contraction" ? "Retention" : "Company";
  return <section className="terminal-ranking-placeholder" aria-label={`${title} data availability`}>
    <div className="bc-empty-shell">
      <div className="bc-empty-table-head" aria-hidden="true">
        <span>COMPANY</span><span>GEOGRAPHY</span><span>{isCompanies?"INDUSTRY":"INDICATION"}</span>
        <span>{isCompanies?"ACTIVITY":"EVIDENCE"}</span><span>UPDATED</span>
      </div>
      <div className="bc-empty-table-rows" aria-hidden="true">
        {Array.from({length:4},(_,i)=><div className="bc-empty-table-row" key={i}>
          <i/><i/><i/><i/><i/>
        </div>)}
      </div>
      <div className="bc-empty-overlay" role="status">
        <span className="bc-empty-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 18V5M4 18h16M8 14l4-4 3 2 4-5"/><circle cx="19" cy="7" r="1.3" fill="currentColor" stroke="none"/>
          </svg>
        </span>
        <strong>{isCompanies?"Company index temporarily unavailable":`${title} rankings temporarily unavailable`}</strong>
        <p>The company intelligence database is not connected to this preview. Search tools are ready, but we won't display unverified companies or invented likelihoods.</p>
        <div className="bc-empty-actions">
          <Link href="/contracts">Explore public contracts <span aria-hidden="true">↗</span></Link>
          <Link href="/api/status/public">Connection status</Link>
        </div>
      </div>
    </div>
  </section>;
}
