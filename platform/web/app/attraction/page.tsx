
import Link from "next/link";
import {ResearchCriteriaDialog} from "@/components/ResearchCriteriaDialog";
import {parsePredictionInput,searchPredictionCompanies,type PredictionCompanyRow} from "@/lib/company-intelligence";
import {resolveViewer} from "@/lib/plan";
import {dateLabel,reported} from "@/lib/format";
type RawParams=Record<string,string|string[]|undefined>;
export const dynamic="force-dynamic";
export const metadata={title:"Geographic Attraction",description:"Identify local growth and externally located companies with documented evidence for a target U.S. market."};
function supportedDestination(row:PredictionCompanyRow,state?:string,county?:string){
 const c=row.expansion_components;
 if(c?.destination_claim_supported!==true || !c.destination||typeof c.destination!=="object")return false;
 const d=c.destination as Record<string,unknown>;
 const region=String(d.state||d.region||"").toUpperCase();
 const place=String(d.county||"").toLowerCase();
 return Boolean(state && region===state && (!county||place===county.toLowerCase()));
}
function Results({rows,title,caption}:{rows:PredictionCompanyRow[];title:string;caption:string}){
 return <section className="bc-attraction-results"><div className="bc-panel-head"><div><span className="bc-microcopy">OPPORTUNITY SET</span><h2>{title}</h2><p>{caption}</p></div><strong>{rows.length} matching results</strong></div>
 {rows.length?<div className="terminal-table-scroll"><table className="terminal-table"><thead><tr><th>Company</th><th>Industry</th><th>Observed company geography</th><th>Expansion evidence</th><th>Last signal</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><Link href={"/company/"+row.slug}>{row.canonical_name}</Link></td><td>{reported(row.industry_name)}</td><td>{reported(row.location_label)}<small>{row.location_basis}</small></td><td>{row.expansion_score!=null?Number(row.expansion_score).toFixed(0)+"/100 evidence":"Not rated"}<small>Not a calibrated probability</small></td><td>{dateLabel(row.expansion_date)}</td></tr>)}</tbody></table></div>:<div className="bc-empty-market"><strong>No supported candidates returned for this group.</strong><p>Broaden the time window or select another geography. No implied location plans are inserted for companies without explicit destination evidence.</p></div>}
 </section>;
}
export default async function AttractionPage({searchParams}:{searchParams:Promise<RawParams>}){
 const raw=await searchParams;const values=parsePredictionInput(raw);const target=values.county?values.county+", "+values.state:values.state||"United States";
 let local:PredictionCompanyRow[]=[];let inbound:PredictionCompanyRow[]=[];let ready=false;
 if(process.env.DATABASE_URL)try{
  const viewer=await resolveViewer();
  const inMarket=await searchPredictionCompanies("expansion",values,viewer.plan,viewer.userId);
  local=inMarket.rows;ready=true;
  if(values.state){
    const nationwide={...values,state:undefined,county:undefined,page:1};
    const candidates=await searchPredictionCompanies("expansion",nationwide,viewer.plan,viewer.userId);
    inbound=candidates.rows.filter(row=>{
      const outside=row.location_state!==values.state||Boolean(values.county&&row.location_county?.toLowerCase()!==values.county?.toLowerCase());
      return outside&&supportedDestination(row,values.state,values.county);
    });
  }
 }catch{ready=false;}
 return <div className="bc-attraction-page"><section className="terminal-heading"><div className="terminal-heading-main"><p className="terminal-eyebrow">INTELLIGENCE / ECONOMIC ATTRACTION</p><h1>Expansion & Attraction</h1><p>Identify companies already growing in a target market and externally based firms with explicit, source-supported geographic interest. Funding is important context but is not proof of intended location.</p></div><div className="terminal-heading-right"><span className="terminal-scope-label">TARGET MARKET</span><strong>{target}</strong></div></section>
 <ResearchCriteriaDialog mode="attraction" action="/attraction" initial={values}/>
 <div className="bc-attraction-summary"><div><span>MARKET</span><strong>{target}</strong></div><div><span>LOCAL EXPANSION</span><strong>{ready?local.length:"—"}</strong></div><div><span>EXPLICIT INBOUND MATCHES</span><strong>{ready?inbound.length:"—"}</strong></div></div>
 {ready?<><Results title="Local expansion prospects" caption="Source-backed expansion indications among companies observed in the chosen geography." rows={local}/>{values.state?<Results title="Inbound attraction prospects" caption="Out-of-market companies with an explicitly supported destination matching the selected geography. National first-page search is not an exhaustive attraction universe." rows={inbound}/>:<section className="bc-empty-market"><strong>Choose a state or county for inbound attraction.</strong><p>Nationwide cannot be treated as an external destination relative to itself.</p></section>}</>:<section className="bc-empty-market"><strong>Attraction search requires the company-intelligence database.</strong><p>Verified local and inbound candidates will appear when the source connection is restored. Nothing has been inferred from the historical public-contract archive.</p><Link href="/coverage">Review coverage ↗</Link></section>}
 <div className="terminal-method-note"><strong>Evidence standard</strong><p>Financing and funding may signal growth capacity. An investor, capital event, population trend, cost-of-living advantage, sector demand, talent base or permitting speed alone does not establish a destination. Only explicit, linked geographic evidence qualifies for inbound matching.</p></div>
 </div>;
}
