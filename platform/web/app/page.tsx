import Link from "next/link";

import { AwardTable } from "@/components/AwardTable";
import { DataNote } from "@/components/DataNote";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { MetricCard } from "@/components/MetricCard";
import { RankedList } from "@/components/RankedList";
import { compactMoney } from "@/lib/format";
import { getHomeOverview } from "@/lib/profiles";

export const dynamic = "force-dynamic";

const changeCategories = [
  ["Opening", "opening", "New operating locations and verified openings."],
  ["Growing", "growing", "Expansion, hiring, and facility-growth evidence."],
  ["Moving", "moving", "Source-backed origin and destination changes."],
  ["Shrinking", "shrinking", "Contraction, layoffs, and reduced operations."],
  ["Closing", "closing", "Confirmed closures and location exits."],
  ["New Businesses", "new-businesses", "Formation and licensing signals."],
] as const;

const evidenceFamilies = [
  ["Registrations", "Official formation and corporate registration records."],
  ["Licenses", "Public operating and business-license observations."],
  ["Permits", "Commercial construction and facility activity."],
  ["Workforce", "WARN notices and supported workforce events."],
  ["Economic Development", "Official expansion, investment, and jobs announcements."],
  ["Corporate Filings", "Reviewed public-company disclosures."],
  ["Government Business", "Awards and buying relationships as commercial context."],
] as const;

export default async function HomePage() {
  let data: Awaited<ReturnType<typeof getHomeOverview>> | null = null;
  let error = "";
  try {
    data = await getHomeOverview();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  return <>
    <section className="bc-home-hero">
      <div className="bc-home-copy">
        <p className="eyebrow">BusinessCurrent <span className="beta-chip">Beta</span></p>
        <h1>Business change intelligence, nationwide.</h1>
        <p className="hero-copy">See which businesses are opening, growing, moving, shrinking, and closing — and the evidence behind every signal.</p>
        <div className="hero-actions">
          <Link className="button primary" href="/locations">Explore a market</Link>
          <Link className="button secondary" href="/companies">Search companies</Link>
          <Link className="text-action" href="/search">Explore government business →</Link>
        </div>
        <dl className="trust-strip" aria-label="BusinessCurrent product principles">
          <div><dt>Source backed</dt><dd>Official evidence retained</dd></div>
          <div><dt>Coverage aware</dt><dd>Missing sources stay visible</dd></div>
          <div><dt>Location precise</dt><dd>Company and establishment stay distinct</dd></div>
        </dl>
      </div>
      <div className="market-search-card commercial-card">
        <p className="eyebrow">National market search</p>
        <h2>What is changing here?</h2>
        <p>Search by city, county, state, or ZIP. No FIPS code required.</p>
        <form action="/locations" method="get">
          <label htmlFor="market-search">Market</label>
          <div className="market-search-line">
            <input id="market-search" name="q" placeholder="Rockville, MD or 20850" autoComplete="postal-code" />
            <button className="button primary" type="submit">Explore</button>
          </div>
        </form>
        <div className="market-shortcuts"><span>Popular:</span><Link href="/location/md/24031">Montgomery County, MD</Link><Link href="/business-change?state=VA&period=90">Virginia</Link><Link href="/business-change?state=DC&period=90">Washington, DC</Link></div>
      </div>
    </section>

    <section className="section product-preview">
      <div className="section-header"><div><p className="eyebrow">Business Change Radar</p><h2>One view of the business lifecycle</h2><p>Move from an early source event to the company, location, supporting evidence, and confirmed outcome.</p></div><Link href="/business-change">Open Radar →</Link></div>
      <div className="change-category-grid">{changeCategories.map(([label, tab, description]) => <Link href={`/business-change?tab=${tab}&period=90`} key={tab}><span>{label}</span><p>{description}</p><strong>Explore signals →</strong></Link>)}</div>
    </section>

    <section className="section evidence-section">
      <div className="section-header"><div><p className="eyebrow">Evidence, not guesses</p><h2>Understand why we believe a business changed.</h2><p>A single source rarely proves a business changed. BusinessCurrent preserves the evidence and distinguishes confirmed events from early indications.</p></div><Link href="/methodology">Read the methodology →</Link></div>
      <div className="evidence-family-grid">{evidenceFamilies.map(([name, description]) => <article key={name}><span aria-hidden="true" /><strong>{name}</strong><p>{description}</p></article>)}</div>
    </section>

    <section className="section coverage-callout">
      <div><p className="eyebrow">Built state by state</p><h2>Nationwide federal sources + transparent state and local coverage.</h2><p>BusinessCurrent does not pretend every jurisdiction publishes the same data. See what is active, partial, restricted, or still planned across all 50 states and DC.</p></div>
      <Link className="button secondary" href="/data-coverage">View national coverage</Link>
    </section>

    {!data ? <DatabaseNotice message={error} /> : <section className="section government-layer">
      <div className="section-header"><div><p className="eyebrow">Government Business</p><h2>A powerful evidence family, not the whole product.</h2><p>Federal awards add commercial context. Recipient addresses, verified headquarters, operating establishments, and places of performance remain separate.</p></div><Link href="/search">Search government business →</Link></div>
      <div className="metrics-grid">
        <MetricCard label="U.S. companies" value={Number(data.metrics?.companies || 0).toLocaleString()} note="awarded legal entities" />
        <MetricCard label="U.S. contracts" value={Number(data.metrics?.awards || 0).toLocaleString()} note="normalized federal awards" />
        <MetricCard label="Disclosed obligations" value={compactMoney(data.metrics?.activity)} note="transaction obligations only" />
        <MetricCard label="States represented" value={Number(data.metrics?.states || 0).toLocaleString()} note="recipient or performance evidence" />
      </div>
      <DataNote updated={data.lastUpdated} />
      <div className="government-layer-content">
        <div><div className="section-header"><div><h2>Recent federal contracts</h2></div></div><AwardTable rows={data.recent} compact /></div>
        <div className="split-grid"><div className="panel"><div className="panel-header"><h2>Active companies</h2><Link href="/companies">View all →</Link></div><RankedList rows={data.companies} route="company" /></div><div className="panel"><div className="panel-header"><h2>Active industries</h2><Link href="/industries">View all →</Link></div><RankedList rows={data.industries} route="industry" /></div></div>
      </div>
    </section>}
  </>;
}
