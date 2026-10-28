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
  ["Closing", "closing", "Confirmed closures and location exits."],
  ["Shrinking", "shrinking", "Contraction, layoffs, and reduced operations."],
  ["New businesses", "new-businesses", "Formation and licensing signals."],
] as const;

export default async function HomePage() {
  let data: Awaited<ReturnType<typeof getHomeOverview>> | null = null;
  let error = "";
  try { data = await getHomeOverview(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  return <>
    <section className="hero market-hero">
      <div><p className="eyebrow">Location-first company intelligence</p><h1>See how businesses are changing in any market.</h1><p className="hero-copy">Find evidence of businesses opening, growing, moving, closing, shrinking, and forming—without confusing a company, an operating location, or a procurement address.</p><div className="hero-actions"><Link className="button secondary" href="/data-coverage">Review source coverage</Link></div></div>
      <div className="hero-panel market-search-card"><p className="eyebrow">Choose a market</p><h2>What is changing here?</h2><form action="/business-change" method="get"><input type="hidden" name="tab" value="opening" /><input type="hidden" name="period" value="90" /><div className="market-fields"><label>State<input name="state" maxLength={2} placeholder="MD" /></label><label>County<input name="county" placeholder="Montgomery County" /></label><label>City<input name="city" placeholder="Rockville" /></label></div><button className="button primary" type="submit">Explore this market</button><small>Starts with the last 90 days. You can refine industry, dates, confidence, ZIP, and source on the radar.</small></form></div>
    </section>
    <section className="section"><div className="section-header"><div><p className="eyebrow">Business Change Radar</p><h2>Follow the change that matters to you</h2><p>Each category stays evidence-backed and geography-aware. Empty results describe current coverage, not the absence of real-world activity.</p></div></div><div className="change-category-grid">{changeCategories.map(([label, tab, description]) => <Link href={`/business-change?tab=${tab}&period=90`} key={tab}><span>{label}</span><p>{description}</p><strong>Explore →</strong></Link>)}</div></section>
    <section className="section evidence-section"><div className="section-header"><div><p className="eyebrow">Evidence before inference</p><h2>Know what supports every signal</h2></div><Link href="/data-coverage">See coverage and limitations →</Link></div><div className="evidence-grid"><article><strong>Official-source records</strong><p>Licenses, permits, formation records, economic-development announcements, filings, and government activity retain their source links.</p></article><article><strong>Places stay distinct</strong><p>Operating establishments, recipient addresses, headquarters evidence, and places of contract performance are modeled separately.</p></article><article><strong>Confidence stays legible</strong><p>Confirmed outcomes, descriptive indications, and validated predictions are labeled as different layers—not blended into one claim.</p></article></div></section>
    {!data ? <DatabaseNotice message={error} /> : <>
      <section className="section government-layer"><div className="section-header"><div><p className="eyebrow">Government Business Layer</p><h2>Procurement context for companies and markets</h2><p>Federal awards add commercial context. Recipient and performance locations remain separate from verified operating establishments.</p></div><Link href="/search">Search procurement →</Link></div>
      <div className="metrics-grid">
        <MetricCard label="U.S. companies" value={Number(data.metrics?.companies || 0).toLocaleString()} note="awarded legal entities" />
        <MetricCard label="U.S. contracts" value={Number(data.metrics?.awards || 0).toLocaleString()} note="normalized federal awards" />
        <MetricCard label="Disclosed obligations" value={compactMoney(data.metrics?.activity)} note="transaction obligations only" />
        <MetricCard label="States represented" value={Number(data.metrics?.states || 0).toLocaleString()} note="recipient or performance" />
      </div>
      <DataNote updated={data.lastUpdated} />
      <div className="government-layer-content"><div><div className="section-header"><div><h2>Recent federal contracts</h2></div></div><AwardTable rows={data.recent} compact /></div><div className="split-grid"><div className="panel"><div className="panel-header"><h2>Top U.S. companies</h2><Link href="/companies">View all →</Link></div><RankedList rows={data.companies} route="company" /></div><div className="panel"><div className="panel-header"><h2>Top U.S. industries</h2><Link href="/industries">View all →</Link></div><RankedList rows={data.industries} route="industry" /></div></div></div>
      </section>
    </>}
  </>;
}
