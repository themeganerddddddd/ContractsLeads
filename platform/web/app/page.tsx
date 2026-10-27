import Link from "next/link";
import { AwardTable } from "@/components/AwardTable";
import { DataNote } from "@/components/DataNote";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { MetricCard } from "@/components/MetricCard";
import { RankedList } from "@/components/RankedList";
import { compactMoney } from "@/lib/format";
import { getHomeOverview } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let data: Awaited<ReturnType<typeof getHomeOverview>> | null = null;
  let error = "";
  try { data = await getHomeOverview(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  return <>
    <section className="hero">
      <div><p className="eyebrow">Government and company intelligence</p><h1>Public markets,<br />mapped.</h1><p className="hero-copy">Search government procurement and source-backed company movements while keeping legal entities, recipient addresses, work locations, and event locations distinct.</p><div className="hero-actions"><Link className="button primary" href="/search">Search procurement</Link><Link className="button secondary" href="/movements">Explore movements</Link></div></div>
      <div className="hero-panel"><h2>Two locations. Two different questions.</h2><p>Recipient addresses identify where a company is based. Place of performance identifies where the contracted work occurs.</p><div className="geo-search">
        <form action="/search"><input type="hidden" name="mode" value="companies" /><label><span>Companies based in <small>Recipient location</small></span><div><input name="recipient_county" aria-label="Recipient county FIPS" placeholder="County FIPS, e.g. 24031" /><button className="button primary">Search</button></div></label></form>
        <form action="/search"><input type="hidden" name="mode" value="contracts" /><label><span>Work performed in <small className="pro-chip">Pro search</small></span><div><input name="performance_county" aria-label="Performance county FIPS" placeholder="County FIPS, e.g. 24031" /><button className="button primary">Search</button></div></label></form>
      </div></div>
    </section>
    <section className="business-change-home"><div><p className="eyebrow">Location-based business intelligence</p><h2>Business Change Radar</h2><p>What businesses are opening, closing, growing, shrinking, forming, or moving in this place?</p></div><form action="/business-change" method="get"><input type="hidden" name="tab" value="opening" /><input type="hidden" name="period" value="90" /><label htmlFor="market-state">Start with a state</label><div><input id="market-state" name="state" maxLength={2} placeholder="MD" aria-describedby="market-help" /><button className="button primary" type="submit">Explore market</button></div><small id="market-help">Add county, city, ZIP, industry, and source filters on the results page.</small></form><Link href="/data-coverage">Review coverage before interpreting counts →</Link></section>
    {!data ? <DatabaseNotice message={error} /> : <>
      <div className="metrics-grid">
        <MetricCard label="U.S. companies" value={Number(data.metrics?.companies || 0).toLocaleString()} note="awarded legal entities" />
        <MetricCard label="U.S. contracts" value={Number(data.metrics?.awards || 0).toLocaleString()} note="normalized federal awards" />
        <MetricCard label="Disclosed obligations" value={compactMoney(data.metrics?.activity)} note="transaction obligations only" />
        <MetricCard label="States represented" value={Number(data.metrics?.states || 0).toLocaleString()} note="recipient or performance" />
      </div>
      <DataNote updated={data.lastUpdated} />
      <section className="section"><div className="section-header"><div><p className="eyebrow">U.S. market pulse</p><h2>Recent federal contracts</h2></div><Link href="/search">Search all markets →</Link></div><AwardTable rows={data.recent} compact /></section>
      <section className="section"><div className="section-header"><div><p className="eyebrow">Capital at work</p><h2>Largest recent awards</h2></div></div><AwardTable rows={data.largest} compact /></section>
      <section className="section split-grid"><div className="panel"><div className="panel-header"><h2>Top U.S. companies</h2><Link href="/companies">View all →</Link></div><RankedList rows={data.companies} route="company" /></div><div className="panel"><div className="panel-header"><h2>Top U.S. industries</h2><Link href="/industries">View all →</Link></div><RankedList rows={data.industries} route="industry" /></div></section>
    </>}
  </>;
}
