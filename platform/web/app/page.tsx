import Link from "next/link";

import { DatabaseNotice } from "@/components/DatabaseNotice";
import { OfficialContractsExplorer } from "@/components/OfficialContractsExplorer";
import { getHomepageCompanyExamples } from "@/lib/company-intelligence";
import { compactMoney, reported } from "@/lib/format";

export const dynamic = "force-dynamic";

const products = [
  { number: "01", name: "Expansion Radar", eyebrow: "Growth intelligence", href: "/predicted-expansion", description: "Find companies with source-backed indications of additional capacity, investment and market entry.", icon: "↗" },
  { number: "02", name: "Movement Radar", eyebrow: "Geographic intelligence", href: "/predicted-moves", description: "Connect operating footprints and evidence of potential location changes without confusing a new office with a move.", icon: "⇄" },
  { number: "03", name: "Retention Radar", eyebrow: "Business retention", href: "/predicted-contraction", description: "Monitor workforce and operational changes that warrant a closer look from economic developers and commercial teams.", icon: "◈" },
] as const;

function changeLabel(value: string | null) {
  const labels: Record<string, string> = { expansion: "Expansion", growth: "Growing", relocation: "Movement", contraction: "Contraction", closure_distress: "Closure evidence" };
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
    <section className="studio-hero">
      <div className="studio-hero-grid">
        <div className="studio-hero-content">
          <div className="studio-kicker"><span className="studio-live-dot" /> COMPANY INTELLIGENCE · BUILT ON EVIDENCE</div>
          <h1>Know which companies <em>are changing.</em></h1>
          <p className="studio-hero-description">Explore government business histories, follow corporate signals, and understand where companies are growing, moving, or facing pressure.</p>
          <p className="studio-hero-support">Find the companies that are changing before everyone else does.</p>
          <form action="/companies" method="get" className="studio-search" role="search">
            <label className="sr-only" htmlFor="studio-search-company">Search company and legal names</label>
            <span aria-hidden="true" className="studio-search-icon">⌕</span>
            <input id="studio-search-company" name="q" placeholder="Search a company or legal name" autoComplete="organization" />
            <button type="submit">Explore company <span aria-hidden="true">↗</span></button>
          </form>
          <div className="studio-hero-links"><Link href="/contracts">Explore contract history <span aria-hidden="true">↗</span></Link><Link href="/locations">Explore by location <span aria-hidden="true">↗</span></Link></div>
          <p className="studio-hero-footnote">Official sources first. Every claim retains its evidence. Signals are not predictions.</p>
        </div>
        <aside className="studio-monitor" aria-label="Company intelligence preview">
          <div className="studio-monitor-top"><span><i className="studio-live-dot" /> INTELLIGENCE MONITOR</span><span>LIVE SOURCE VIEW</span></div>
          <div className="studio-monitor-title"><span>DISCOVER / CHANGING COMPANIES</span><strong>From activity to insight.</strong><p>Follow the company. Trace the source. Understand the change.</p></div>
          <div className="studio-monitor-list">
            {companies.length ? companies.slice(0, 4).map((company, index) => <Link href={`/company/${company.slug}`} key={company.id} className="studio-monitor-row">
              <span className="studio-monitor-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="studio-monitor-company"><strong>{company.canonical_name}</strong><small>{reported(company.location_label)} · {reported(company.industry_name)}</small></span>
              <span className="studio-monitor-change">{changeLabel(company.latest_change_type)} <span aria-hidden="true">↗</span></span>
            </Link>) : <div className="studio-monitor-empty"><strong>No company snapshot available yet.</strong><span>When the database is connected, current source-backed companies will appear here.</span></div>}
          </div>
          <div className="studio-monitor-bottom"><div><span className="studio-monitor-icon">◎</span><span>Government contracts<br/><strong>Historical transactions</strong></span></div><div><span className="studio-monitor-icon">◫</span><span>Company change<br/><strong>Evidence &amp; locations</strong></span></div></div>
          <div className="studio-monitor-status"><span className="studio-live-dot" /> Coverage varies by source and geography <Link href="/coverage">Explore coverage ↗</Link></div>
        </aside>
      </div>
      <div className="studio-hero-bottom"><span>COMPANY PROFILES</span><span>GOVERNMENT CONTRACT HISTORY</span><span>LOCATION INTELLIGENCE</span><span>EXPANSION &amp; RETENTION SIGNALS</span></div>
    </section>

    <section className="studio-section studio-section-intro">
      <div className="studio-section-title"><div><p className="studio-section-label">THE INTELLIGENCE LAYER</p><h2>Follow the signal.<br/><span>Understand the company.</span></h2></div><p>Traditional databases tell you what happened. BusinessCurrent connects the underlying public records so you can investigate what may be changing.</p></div>
      <div className="studio-product-grid">{products.map(product => <Link className="studio-product-card" href={product.href} key={product.number}>
        <span className="studio-card-top"><span>{product.number} / {product.eyebrow}</span><span aria-hidden="true">{product.icon}</span></span>
        <span className="studio-card-bottom"><strong>{product.name}</strong><span>{product.description}</span><span className="studio-card-link">Explore radar <b aria-hidden="true">↗</b></span></span>
      </Link>)}</div>
    </section>

    <section className="studio-section studio-source-section">
      <div className="studio-source-copy"><p className="studio-section-label">THE HISTORICAL RECORD</p><h2>A company's story is in the data.</h2><p>See federal contract awards, individual modifications, net obligations, buyer relationships and the timeline behind a company's government business. Disclosed obligations are not estimated company revenue.</p><div className="studio-source-actions"><Link className="studio-solid-link" href="/contracts">Explore government contracts <span aria-hidden="true">↗</span></Link><Link href="/methodology">Our methodology ↗</Link></div></div>
      <div className="studio-source-art" aria-hidden="true"><div className="studio-source-art-top">A LONGITUDINAL VIEW <span>US · CONTRACTS</span></div><div className="studio-source-bars">{[28,45,33,58,47,71,63,86,74,95,83,100].map((height, i) => <span key={i} style={{height: `${height}%`}} />)}</div><div className="studio-source-art-bottom"><span>TRANSACTION HISTORY</span><span>01 — 12 / ILLUSTRATIVE</span></div></div>
    </section>

    <section className="studio-section studio-live-section">
      <div className="studio-section-title"><div><p className="studio-section-label">LIVE COMPANY INTELLIGENCE</p><h2>Start with the companies<br/><span>behind the signals.</span></h2></div><Link className="studio-outline-link" href="/companies">Explore all companies <span aria-hidden="true">↗</span></Link></div>
      {error ? <div className="studio-public-mode"><OfficialContractsExplorer compact /><p className="studio-public-mode-note">Company intelligence is not connected to this deployment. <a href="/api/status/public">Check source status ↗</a></p></div> : companies.length ? <div className="studio-table-shell"><div className="studio-table-overline"><span><span className="studio-live-dot" /> SOURCE-BACKED COMPANY INDEX</span><span>Disclosed U.S. obligations only</span></div><div className="table-wrap"><table className="data-table studio-feature-table"><thead><tr><th>Company</th><th>Industry</th><th>Observed location</th><th>Latest change</th><th className="numeric">Government business</th><th aria-label="Open profile" /></tr></thead><tbody>{companies.map(company => <tr key={company.id}><td><Link className="primary-cell" href={`/company/${company.slug}`}>{company.canonical_name}</Link></td><td>{reported(company.industry_name)}</td><td>{reported(company.location_label)}<small>{company.location_basis}</small></td><td><span className="studio-data-pill">{changeLabel(company.latest_change_type)}</span></td><td className="numeric"><strong>{compactMoney(company.government_business)}</strong></td><td><Link aria-label={`View ${company.canonical_name}`} href={`/company/${company.slug}`}>↗</Link></td></tr>)}</tbody></table></div></div> : <div className="empty-panel"><strong>No public company examples are available.</strong><p>Connect and refresh the company database to populate this live section.</p></div>}
    </section>
    <section className="studio-endcap"><div><p className="studio-section-label">EXPLORE THE EVIDENCE</p><h2>Intelligence worth checking.<br/>Sources worth trusting.</h2><p>Company identities, operating locations and work locations are kept separate. Every signal is traceable to the records that support it.</p></div><Link href="/companies" className="studio-endcap-cta">Explore BusinessCurrent <span aria-hidden="true">↗</span></Link></section>
  </>;
}
