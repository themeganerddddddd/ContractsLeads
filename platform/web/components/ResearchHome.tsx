
"use client";
import Link from "next/link";
import {useState} from "react";
import {GeoMarketSelector} from "@/components/GeoMarketSelector";
import {US_STATES} from "@/components/MarketFilterBar";
import type {MarketFilterValues} from "@/lib/market-filters";
import {marketHref} from "@/lib/market-filters";

export type HomeSignal={id:string;name:string;slug:string;sector:string;location:string;observedState:string;observedCounty:string;signalDate:string;score:string|null;probability:string|null;verifiedDestination:string|null;destinationState:string|null;type:"expansion"|"contraction"|"movement"};
type Tab="Local expansion"|"Inbound attraction"|"Contraction risk";
export function ResearchHome({values,signals,hasDatabase}:{values:MarketFilterValues;signals:HomeSignal[];hasDatabase:boolean}){
 const [tab,setTab]=useState<Tab>("Local expansion");
 const inScope=(r:HomeSignal)=>!values.state || (r.observedState===values.state && (!values.county||r.observedCounty.toLowerCase()===values.county.toLowerCase()));
 const local=signals.filter(r=>r.type==="expansion" && inScope(r));
 const inbound=signals.filter(r=>r.type==="expansion" && !inScope(r) && Boolean(r.verifiedDestination) && (!values.state||r.destinationState===values.state));
 const contraction=signals.filter(r=>r.type==="contraction"&&inScope(r));
 const rows=tab==="Local expansion"?local:tab==="Inbound attraction"?inbound:contraction;
 const stateName=US_STATES.find(([code])=>code===values.state)?.[1]||values.state;
 const target=values.county?values.county+", "+stateName:stateName||"United States";
 const path=tab==="Contraction risk"?"/predicted-contraction":tab==="Inbound attraction"?"/attraction":"/predicted-expansion";
 return <div className="bc-desk">
  <div className="bc-desk-heading"><div><span className="bc-microcopy">YOUR RESEARCH WORKSPACE / MARKET INTELLIGENCE</span><h1>Good morning. <span>Your market, in focus.</span></h1><p>Follow companies, capital activity and documented change signals relevant to your target geography.</p></div><Link href="/companies" className="bc-outline-btn">Company search ↗</Link></div>
  <GeoMarketSelector state={values.state} county={values.county} country={values.country}/>
  <div className="bc-desk-stats">
    <div><span>YOUR MARKET</span><strong>{target}</strong><small>Editable geographic focus</small></div>
    <div><span>EXPANSION CANDIDATES</span><strong>{hasDatabase?local.length.toLocaleString():"—"}</strong><small>Matches in retrieved coverage</small></div>
    <div><span>INBOUND ATTRACTION</span><strong>{hasDatabase?inbound.length.toLocaleString():"—"}</strong><small>Destination-supported matches</small></div>
    <div><span>RETENTION SIGNALS</span><strong>{hasDatabase?contraction.length.toLocaleString():"—"}</strong><small>Matches in retrieved coverage</small></div>
  </div>
  <div className="bc-desk-columns">
   <section className="bc-desk-main"><div className="bc-panel-head"><div><span className="bc-microcopy">MARKET OPPORTUNITY</span><h2>Companies worth investigating</h2><p>Source-linked signals within your selected market. No inferred destinations are substituted.</p></div><Link href={marketHref(path,values)}>Open screener ↗</Link></div>
    <div className="bc-segmented" role="group" aria-label="Opportunity category">{(["Local expansion","Inbound attraction","Contraction risk"] as Tab[]).map(t=><button key={t} aria-pressed={t===tab} type="button" className={t===tab?"is-selected":""} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {rows.length?<div className="bc-home-signal-rows">{rows.slice(0,7).map(row=><Link href={"/company/"+row.slug} key={row.type+row.id} className="bc-home-signal"><div className="bc-home-logo" aria-hidden="true">{row.name.split(" ").map(w=>w[0]).slice(0,2).join("")}</div><div><strong>{row.name}</strong><small>{row.sector} · {row.location}</small></div><div className="bc-signal-side">{row.probability?<strong>{Math.round(Number(row.probability)*100)}% validated</strong>:<strong>{row.score!=null?`Evidence ${Math.round(Number(row.score))}/100`:"Evidence not rated"}</strong>}<small>{row.signalDate||"Date not reported"}</small></div><span aria-hidden="true">↗</span></Link>)}</div>:
    <div className="bc-empty-market"><strong>{hasDatabase?"No supported matches in the current view.":"Company intelligence is not currently connected."}</strong><p>{hasDatabase?"Broaden your market or open the screener. An empty result is not evidence that no activity occurred.":"The live PostgreSQL connection is required for ranked company opportunities. No fictional companies are displayed."}</p><Link href={marketHref(path,values)}>Open advanced search ↗</Link></div>}
    <div className="bc-panel-bottom"><span>{hasDatabase?"Showing up to seven source-backed matches":"Coverage unavailable"}</span><Link href={marketHref(path,values)}>View all matching companies →</Link></div>
   </section>
   <aside className="bc-desk-rail"><section className="bc-desk-card"><span className="bc-microcopy">MY RESEARCH</span><h2>Saved work</h2><p>Return to your monitored companies, saved searches and alerts.</p><nav><Link href="/tracked-companies">Monitored companies <span>↗</span></Link><Link href="/saved-searches">Saved searches <span>↗</span></Link><Link href="/alerts">Intelligence alerts <span>↗</span></Link></nav></section>
   <section className="bc-desk-card"><span className="bc-microcopy">RESEARCH TOOLS</span><h2>Start a search</h2><nav><Link href="/companies">Company search <span>↗</span></Link><Link href="/deals">New deals <span>↗</span></Link><Link href="/predicted-expansion">Expansion intelligence <span>↗</span></Link><Link href={marketHref("/attraction",values)}>Geographic attraction <span>↗</span></Link><Link href="/predicted-contraction">Contraction risk <span>↗</span></Link></nav></section></aside>
  </div>
  <div className="bc-desk-lower"><section className="bc-desk-card"><span className="bc-microcopy">GEOGRAPHIC OUTLOOK</span><h2>Where could a company expand?</h2><p>Open an individual company dossier to view mapped, source-supported destinations. Geographic attractiveness alone never establishes intent.</p><div className="bc-mini-map" role="img" aria-label="Geographic outlook is available within company profiles"><div className="bc-mini-map-dots">○ &nbsp; ◌ &nbsp; ◦</div><span>COMPANY-SPECIFIC DESTINATION INTELLIGENCE</span></div><Link href="/companies">Find a company to investigate →</Link></section>
   <section className="bc-desk-card"><span className="bc-microcopy">RECENT ACTIVITY</span><h2>Capital & deals</h2><p>Monitor sourced corporate financing and transactions as coverage becomes available. Browse official public federal contract awards separately.</p><nav><Link href="/deals">New deals screener <span>↗</span></Link><Link href="/contracts">Official contract awards <span>↗</span></Link><Link href="/coverage">Source coverage <span>↗</span></Link></nav></section>
  </div>
  <p className="bc-home-legal">Research results depend on verified source coverage and plan access. An evidence score is not a calibrated likelihood. Market selection does not automatically imply company operating locations.</p>
 </div>;
}
