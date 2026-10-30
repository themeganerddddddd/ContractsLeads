import Link from "next/link";

import { parseMarketQuery } from "@/lib/markets";

export const metadata = { title: "Markets", description: "Explore business change by city, county, state, or ZIP." };

type RawParams = Record<string, string | string[] | undefined>;

const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

const featuredMarkets = [
  ["Montgomery County, Maryland", "/location/md/24031", "County profile with supported permits, workforce, economic-development, and government-business context."],
  ["Maryland", "/business-change?state=MD&period=90", "Active WARN and economic-development coverage with partial local permit coverage."],
  ["Virginia", "/business-change?state=VA&period=90", "Active statewide WARN coverage plus nationwide government-business evidence."],
  ["Washington, DC", "/business-change?state=DC&period=90", "Partial business-license coverage plus nationwide government-business evidence."],
] as const;

export default async function MarketsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const q = scalar((await searchParams).q)?.trim() || "";
  const market = q ? parseMarketQuery(q) : null;
  const radarHref = market ? `/business-change?${market.radarParams.toString()}` : "/business-change";

  return <>
    <section className="page-heading market-directory-heading"><p className="eyebrow">Markets</p><h1>What is changing in this market?</h1><p>Search by city, county, state, or ZIP. BusinessCurrent applies only supported geographic evidence and keeps coverage limitations visible.</p></section>
    <section className="market-directory-search">
      <form action="/locations" method="get"><label htmlFor="market-directory-q">City, county, state, or ZIP</label><div><input id="market-directory-q" name="q" defaultValue={q} placeholder="Orleans Parish, LA" autoFocus={!q} /><button className="button primary" type="submit">Find market</button></div></form>
      {market ? <div className="market-query-result"><div><p className="eyebrow">Matched as {market.kind.replace("_", " ")}</p><h2>{market.label}</h2><p>Open the Radar with a 90-day window. Refine industry, evidence level, dates, and source family there.</p></div><Link className="button primary" href={radarHref}>View market activity</Link></div> : null}
    </section>
    <section className="section"><div className="section-header"><div><p className="eyebrow">Available market briefs</p><h2>Start with covered markets</h2><p>Local-source depth is not uniform. Federal government-business evidence is nationwide; state and local families expand independently.</p></div><Link href="/data-coverage">Compare coverage →</Link></div><div className="market-card-grid">{featuredMarkets.map(([name, href, description]) => <Link href={href} key={name}><span>Market brief</span><h3>{name}</h3><p>{description}</p><strong>Explore →</strong></Link>)}</div></section>
  </>;
}
