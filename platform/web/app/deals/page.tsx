
import Link from "next/link";
import {ResearchCriteriaDialog} from "@/components/ResearchCriteriaDialog";
import {OfficialContractsExplorer} from "@/components/OfficialContractsExplorer";
type RawParams=Record<string,string|string[]|undefined>;
export const dynamic="force-dynamic";
export const metadata={title:"New Deals",description:"Search newly disclosed financing and corporate transactions as source coverage becomes available; separate official contract awards."};
export default async function DealsPage({searchParams}:{searchParams:Promise<RawParams>}){
 const params=await searchParams;
 const q=typeof params.recipient==="string"?params.recipient:typeof params.q==="string"?params.q:"";
 return <section className="bc-deal-screen">
   <div className="terminal-heading"><div className="terminal-heading-main"><p className="terminal-eyebrow">RESEARCH / DEALS</p><h1>New Deals</h1><p>One dedicated workspace for funding, acquisitions and capital events, with source-linked evidence. Federal contract awards remain clearly separated.</p></div></div>
   <ResearchCriteriaDialog mode="deals" action="/deals" initial={{q}}/>
   <section className="terminal-result-pane" style={{marginTop:20}}><div className="terminal-result-head"><div><p className="terminal-eyebrow">CORPORATE TRANSACTIONS / RESULTS</p><h2>Newly disclosed financing & transactions</h2><p>Companies, deal dates, amounts, backers and cited announcement sources will appear when verified transaction coverage is available.</p></div><div className="terminal-result-meta"><strong>—</strong><span>verified matches currently available</span></div></div>
   <div className="bc-empty-market"><strong>Corporate funding data is not yet connected to this screener.</strong><p>The current repository does not establish a verified, queryable funding-and-M&A deal feed. We will not re-label procurement contracts as venture investment or fabricate transaction rows. Filters and research layout are ready for ingestion of genuine records.</p><Link href="/coverage">View available data sources ↗</Link></div></section>
   <section className="bc-deals-contracts"><div className="bc-panel-head"><div><span className="bc-microcopy">SEPARATE RECORD TYPE</span><h2>New federal contract awards</h2><p>Official public procurement records are shown below as government business—not venture, equity or M&A deals.</p></div><Link href="/contracts">Full contract screener ↗</Link></div><OfficialContractsExplorer searchParams={params}/></section>
 </section>
}
