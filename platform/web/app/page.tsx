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
      <div><p className="eyebrow">Federal market intelligence</p><h1>Federal contracting,<br />mapped.</h1><p className="hero-copy">Search federal contract activity by company, industry, agency, where contractors are based, or where the work actually happens.</p><div className="hero-actions"><Link className="button primary" href="/search">Search contracts</Link><Link className="button secondary" href="/pricing">View plans</Link></div></div>
      <div className="hero-panel"><h2>Two locations. Two different questions.</h2><p>Recipient addresses identify where a company is based. Place of performance identifies where the contracted work occurs.</p><div className="geo-search">
        <form action="/search"><input type="hidden" name="mode" value="companies" /><label><span>Companies based in <small>Recipient location</small></span><div><input name="recipient_county" aria-label="Recipient county FIPS" placeholder="County FIPS, e.g. 24031" /><button className="button primary">Search</button></div></label></form>
        <form action="/search"><input type="hidden" name="mode" value="contracts" /><label><span>Work performed in <small className="pro-chip">Pro search</small></span><div><input name="performance_county" aria-label="Performance county FIPS" placeholder="County FIPS, e.g. 24031" /><button className="button primary">Search</button></div></label></form>
      </div></div>
    </section>
    {!data ? <DatabaseNotice message={error} /> : <>
      <div className="metrics-grid">
        <MetricCard label="Companies" value={Number(data.metrics?.companies || 0).toLocaleString()} note="awarded legal entities" />
        <MetricCard label="Contracts" value={Number(data.metrics?.awards || 0).toLocaleString()} note="normalized awards" />
        <MetricCard label="Disclosed obligations" value={compactMoney(data.metrics?.activity)} note="transaction obligations only" />
        <MetricCard label="States represented" value={Number(data.metrics?.states || 0).toLocaleString()} note="recipient or performance" />
      </div>
      <DataNote updated={data.lastUpdated} demo />
      <section className="section"><div className="section-header"><div><p className="eyebrow">Market pulse</p><h2>Recent contracts</h2></div><Link href="/contracts">All contracts →</Link></div><AwardTable rows={data.recent} compact /></section>
      <section className="section"><div className="section-header"><div><p className="eyebrow">Capital at work</p><h2>Largest recent awards</h2></div></div><AwardTable rows={data.largest} compact /></section>
      <section className="section split-grid"><div className="panel"><div className="panel-header"><h2>Top companies</h2><Link href="/companies">View all →</Link></div><RankedList rows={data.companies} route="company" /></div><div className="panel"><div className="panel-header"><h2>Top industries</h2><Link href="/industries">View all →</Link></div><RankedList rows={data.industries} route="industry" /></div></section>
    </>}
  </>;
}
