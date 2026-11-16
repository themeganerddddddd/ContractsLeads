import Link from "next/link";

import { MarketFilterBar, marketHref } from "@/components/MarketFilterBar";
import { Pagination } from "@/components/Pagination";
import { PaywallNotice } from "@/components/PaywallNotice";
import { indicationLabel } from "@/lib/change-intelligence";
import {
  getCompanyFilterOptions,
  parsePredictionInput,
  searchPredictionCompanies,
  type PredictionCompanyRow,
  type PredictionKind,
} from "@/lib/company-intelligence";
import { compactMoney, dateLabel, reported } from "@/lib/format";
import { resolveViewer } from "@/lib/plan";

type RawParams = Record<string,string|string[]|undefined>;
type Config = { index: string; title: string; headline: string; purpose: string; assessment: "expansion"|"relocation"|"contraction"; signal: string };
const CONTENT: Record<PredictionKind,Config> = {
  expansion: {
    index:"01",title:"Expansion Radar",headline:"Find the next expansion.",
    purpose:"Surface companies showing verified indications of investment, additional capacity or a new location. Explore the evidence before making an outreach decision.",
    assessment:"expansion",signal:"Expansion",
  },
  moves: {
    index:"02",title:"Movement Radar",headline:"See where companies may move.",
    purpose:"Assess source-backed footprint and relocation indications. An additional operating site does not automatically mean a company is relocating.",
    assessment:"relocation",signal:"Movement",
  },
  contraction: {
    index:"03",title:"Retention Radar",headline:"Find companies that may need attention.",
    purpose:"Prioritize retention outreach using supported contraction, closure and workforce-change indicators—not an isolated contract reduction.",
    assessment:"contraction",signal:"Retention",
  },
};

function assessment(row:PredictionCompanyRow, kind:PredictionKind){
  if(kind==="expansion")return {score:row.expansion_score,date:row.expansion_date,
    sufficiency:row.expansion_sufficiency,components:row.expansion_components,explanation:row.expansion_explanation};
  if(kind==="moves")return {score:row.relocation_score,date:row.relocation_date,
    sufficiency:row.relocation_sufficiency,components:row.relocation_components,explanation:row.relocation_explanation};
  return {score:row.contraction_score,date:row.contraction_date,
    sufficiency:row.contraction_sufficiency,components:row.contraction_components,explanation:row.contraction_explanation};
}

function evidenceLabel(components:Record<string,unknown>|null){
  const items=Array.isArray(components?.items)?components.items:[];
  const first=items[0];
  if(first && typeof first==="object" && "label" in first) return String(first.label);
  return "Source-backed activity pattern";
}

function destinationLabel(components:Record<string,unknown>|null){
  if(!components?.destination_claim_supported) return "Destination unknown";
  const destination=components.destination;
  if(!destination || typeof destination!=="object")return "Destination unknown";
  const v=Object.values(destination).filter(Boolean).map(String);
  return v.length?v.join(", "):"Destination unknown";
}

function evidenceBand(score:string|null){
  if(score==null || !Number.isFinite(Number(score)))return "No score";
  const v=Number(score);
  return v>=70?"Strong":v>=40?"Developing":"Early";
}

function RankedSignalsTable({kind,rows,page}:{kind:PredictionKind;rows:PredictionCompanyRow[];page:number}){
  if(!rows.length) return <section className="terminal-empty">
    <div className="terminal-empty-symbol">—</div>
    <h2>No ranked signals match these filters.</h2>
    <p>Try the full United States, broaden the time range, or clear your county filter. This is a data-coverage statement, not proof that no business activity occurred.</p>
  </section>;
  return <div className="terminal-table-scroll"><table className="terminal-table terminal-ranking-table">
    <thead><tr>
      <th scope="col">Rank</th><th scope="col">Company</th><th scope="col">Observed geography</th>
      <th scope="col">Likelihood / indication</th><th scope="col">Key evidence</th>
      {kind==="moves"?<th scope="col">Potential destination</th>:<th scope="col">Government business</th>}
      <th scope="col">Last signal</th><th scope="col" aria-label="Open company"/>
    </tr></thead>
    <tbody>{rows.map((row,index)=>{
      const item=assessment(row,kind);
      const calibrated =
        row.probability_eligible === true &&
        row.model_status === "active" &&
        row.prediction_sufficiency === "sufficient" &&
        row.probability != null;
      const band=evidenceBand(item.score);
      return <tr key={row.id}>
        <td className="terminal-rank">#{String((page-1)*25+index+1).padStart(2,"0")}</td>
        <td className="terminal-company"><Link href={`/company/${row.slug}`}>{row.canonical_name}</Link>
          <small>{reported(row.industry_name)}</small></td>
        <td><strong>{reported(row.location_label)}</strong><small>{row.location_basis}</small></td>
        <td><div className="terminal-indication">
          {calibrated?
            <strong className="terminal-probability">{Math.round(Number(row.probability)*100)}% <span>calibrated</span></strong> :
            <strong className={`terminal-band terminal-band-${band.toLowerCase().replaceAll(" ","-")}`}>{indicationLabel(item.score,item.sufficiency||undefined)}</strong>}
          <small>{calibrated?`${row.horizon_days||180}-day validated model`:item.score!=null?`Evidence score ${Number(item.score).toFixed(0)}/100 · not a probability`:"Prediction not yet available"}</small>
        </div></td>
        <td><strong className="terminal-evidence-label">{evidenceLabel(item.components)}</strong>
          <small>{item.explanation||"Open company dossier for supporting sources."}</small></td>
        {kind==="moves"?<td>{destinationLabel(item.components)}</td>:
          <td className="terminal-money">{compactMoney(row.government_business)}<small>Disclosed obligations</small></td>}
        <td>{dateLabel(item.date)}</td><td className="terminal-chevron"><Link href={`/company/${row.slug}`} aria-label={`View ${row.canonical_name}`}>↗</Link></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

function Tabs({kind,values}:{kind:PredictionKind;values:Parameters<typeof marketHref>[1]}){
  const tabs: {kind:PredictionKind;href:string;label:string;index:string}[]=[
    {kind:"expansion",href:"/predicted-expansion",label:"Expansion",index:"01"},
    {kind:"moves",href:"/predicted-moves",label:"Movement",index:"02"},
    {kind:"contraction",href:"/predicted-contraction",label:"Retention",index:"03"},
  ];
  return <nav className="terminal-radar-tabs" aria-label="Intelligence categories">
    {tabs.map(t=><Link key={t.kind} href={marketHref(t.href,values)} className={kind===t.kind?"is-current":""}
      aria-current={kind===t.kind?"page":undefined}>
      <span className="terminal-tab-index">{t.index}</span>{t.label}
      {kind===t.kind?<span className="terminal-tab-active" aria-hidden="true">●</span>:null}
    </Link>)}
    <Link href={marketHref("/companies",values)} className="terminal-radar-all">Company directory <span aria-hidden="true">↗</span></Link>
  </nav>;
}

export async function PredictionScreener({kind,searchParams}:{
  kind:PredictionKind;searchParams:Promise<RawParams>;
}){
  const raw=await searchParams;
  const input=parsePredictionInput(raw);
  const copy=CONTENT[kind];
  const path=kind==="expansion"?"/predicted-expansion":kind==="moves"?"/predicted-moves":"/predicted-contraction";
  const values={...input};

  let data:Awaited<ReturnType<typeof searchPredictionCompanies>>|null=null;
  let industries:{slug:string;name:string}[]=[];
  let counties:string[]=[];
  let states:string[]=[];
  let unavailable=!process.env.DATABASE_URL;
  if(!unavailable)try {
    const [viewer,options]=await Promise.all([
      resolveViewer(),getCompanyFilterOptions(input.country==="ALL"?undefined:input.country,input.state,input.county),
    ]);
    const r=await searchPredictionCompanies(kind,input,viewer.plan,viewer.userId);
    data=r;
    industries=options.industries;
    counties=options.counties;
    states=options.states;
  } catch {unavailable=true;}

  const title = copy.title;
  return <div className="terminal-view">
    <section className="terminal-heading">
      <div className="terminal-heading-main">
        <p className="terminal-eyebrow"><span className="terminal-greenline"/> BUSINESSCURRENT / U.S. MARKET INTELLIGENCE</p>
        <h1>{copy.headline}</h1>
        <p>{copy.purpose}</p>
      </div>
      <div className="terminal-heading-right">
        <span className="terminal-scope-label">GEOGRAPHY</span>
        <strong>{input.county ? `${input.county}${input.state?`, ${input.state}`:""}` : input.state? `${input.state} · all counties`:input.country==="US"?"United States":input.country==="ALL"?"Global coverage":input.country}</strong>
        <span className="terminal-status-badge">{unavailable?"Source not connected":"Verified source records"}</span>
      </div>
    </section>
    <Tabs kind={kind} values={values}/>
    <MarketFilterBar action={path} values={values} industries={industries} knownCounties={counties} otherStates={states} />
    <section className="terminal-result-pane">
      <div className="terminal-result-head">
        <div><p className="terminal-eyebrow">{copy.index} / RANKED {copy.signal.toUpperCase()} INTELLIGENCE</p>
        <h2>{title} · ranked companies</h2>
        <p>{unavailable
          ?"The ranked view will populate when its company data source is connected."
          :"Ranked by validated likelihood when available, then descriptive source-evidence strength. Evidence strength is not a calibrated probability."}</p></div>
        {!unavailable ? <div className="terminal-result-meta">
          <strong>{(data?.visibleTotal||0).toLocaleString()}</strong>
          <span>visible signals</span>
        </div> : null}
      </div>
      {unavailable?
        <div className="terminal-ranking-placeholder" role="status">
          <span className="terminal-ranking-placeholder-icon" aria-hidden="true">◌</span>
          <div className="terminal-ranking-placeholder-content">
            <strong>No live {copy.signal.toLowerCase()} rankings to display</strong>
            <p>The company intelligence source is disconnected. The U.S., state and county filters are ready; no likelihoods or signals are being inferred from unrelated contract records.</p>
          </div>
          <Link href="/public-records" className="terminal-ranking-source-link">Source library <span aria-hidden="true">↗</span></Link>
        </div>:
        <>
          {data?.resultLimited?<PaywallNotice title={`Showing ${data.visibleTotal.toLocaleString()} ranked results`}>Additional company records and advanced analysis depend on your plan and available source coverage.</PaywallNotice>:null}
          <RankedSignalsTable kind={kind} rows={data?.rows||[]} page={data?.page||1}/>
          {data?<Pagination page={data.page} pageSize={data.pageSize} total={data.visibleTotal} params={raw}/>:null}
        </>}
    </section>
    <footer className="terminal-method-note">
      <span>◈ Evidence-first methodology</span>
      <p>Ranking is by calibrated model probability only when the model is active and validated; otherwise it is an evidence-priority order. Location is the best supported company geography—not a predicted destination. <Link href="/methodology">Read methodology ↗</Link></p>
    </footer>
  </div>;
}
