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
      <div><p className="eyebrow">Global government procurement intelligence</p><h1>Public contracting,<br />mapped.</h1><p className="hero-copy">Search U.S. federal awards, UK Find a Tender procedures, and EU TED notices by company, buyer, industry, market, and place of performance.</p><div className="hero-actions"><Link className="button primary" href="/search">Search procurement</Link><Link className="button secondary" href="/pricing">View plans</Link></div></div>
      <div className="hero-panel"><h2>Two locations. Two different questions.</h2><p>Recipient addresses identify where a company is based. Place of performance identifies where the contracted work occurs.</p><div className="geo-search">
        <form action="/search"><input type="hidden" name="mode" value="companies" /><label><span>Companies based in <small>Recipient location</small></span><div><input name="recipient_county" aria-label="Recipient county FIPS" placeholder="County FIPS, e.g. 24031" /><button className="button primary">Search</button></div></label></form>
        <form action="/search"><input type="hidden" name="mode" value="contracts" /><label><span>Work performed in <small className="pro-chip">Pro search</small></span><div><input name="performance_county" aria-label="Performance county FIPS" placeholder="County FIPS, e.g. 24031" /><button className="button primary">Search</button></div></label></form>
      </div></div>
    </section>
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
