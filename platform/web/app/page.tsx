import Link from "next/link";

import { DatabaseNotice } from "@/components/DatabaseNotice";
import { getHomepageCompanyExamples } from "@/lib/company-intelligence";
import { compactMoney, reported } from "@/lib/format";

export const dynamic = "force-dynamic";

function changeLabel(value: string | null) {
  const labels: Record<string, string> = { expansion: "Expansion", growth: "Growing", relocation: "Moving", contraction: "Contraction", closure_distress: "Closing risk" };
  return value ? labels[value] || value.replaceAll("_", " ") : "No recent change";
}

export default async function HomePage() {
  let companies: Awaited<ReturnType<typeof getHomepageCompanyExamples>> = [];
  let error = "";
  try {
    companies = await getHomepageCompanyExamples();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return <>
    <section className="sellable-hero">
      <div className="sellable-hero-copy">
        <p className="eyebrow">Company intelligence built around change</p>
        <h1>Find the companies that are changing before everyone else does.</h1>
        <p>Search companies and locations, track commercial activity, and identify expansion, relocation, and contraction signals from source-backed public data.</p>
        <form action="/companies" method="get" className="hero-company-search">
          <label htmlFor="home-company-search">Search companies</label>
          <div><input id="home-company-search" name="q" placeholder="Search a company…" autoComplete="organization" /><button className="button primary" type="submit">Search</button></div>
        </form>
        <div className="hero-actions"><Link className="button primary" href="/companies">Search companies</Link><Link className="button secondary" href="/locations">Explore locations</Link><Link className="text-action" href="/pricing">View plans →</Link></div>
      </div>
      <aside className="hero-proof-card">
        <p className="eyebrow">Operational intelligence</p>
        <h2>Understand what changed—and why.</h2>
        <ul><li>Company and legal-name discovery</li><li>Location semantics kept explicit</li><li>Government obligations, not estimated revenue</li><li>Evidence signals never relabeled as probability</li></ul>
        <Link href="/methodology">How BusinessCurrent works →</Link>
      </aside>
    </section>

    <section className="section live-company-example">
      <div className="section-header"><div><p className="eyebrow">Live company intelligence</p><h2>Start with the companies that matter commercially.</h2><p>These examples come from the current database. Disclosed government-business values are net U.S. obligations—not company revenue.</p></div><Link href="/companies">Open the company screener →</Link></div>
      {error ? <DatabaseNotice message={error} /> : <div className="table-wrap"><table className="data-table home-company-table"><thead><tr><th>Company</th><th>Industry</th><th>Location</th><th>Change</th><th>Government Business</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td><Link className="primary-cell" href={`/company/${company.slug}`}>{company.canonical_name}</Link></td><td>{reported(company.industry_name)}</td><td>{reported(company.location_label)}<small>{company.location_basis}</small></td><td>{changeLabel(company.latest_change_type)}</td><td className="numeric"><strong>{compactMoney(company.government_business)}</strong></td></tr>)}</tbody></table></div>}
    </section>

    <section className="section positioning-panel"><div><p className="eyebrow">A clearer way to screen</p><h2>Company intelligence built around change.</h2><p>Search companies, understand where they operate, see source-backed commercial activity, and identify signals of expansion, relocation, and contraction.</p></div><div className="positioning-links"><Link href="/predicted-expansion">Expansion signals</Link><Link href="/predicted-moves">Move signals</Link><Link href="/predicted-contraction">Contraction signals</Link></div></section>

    <section className="section trust-grid"><article><h3>Source backed</h3><p>Official links and evidence dates remain visible from signal through profile.</p></article><article><h3>Coverage aware</h3><p>Unavailable or partial coverage stays explicit instead of becoming false certainty.</p></article><article><h3>Location precise</h3><p>Verified headquarters, operating locations, and observed recipient addresses remain distinct.</p></article></section>
  </>;
}
