
"use client";
import {useEffect,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from "react";
import {US_STATES} from "@/components/MarketFilterBar";

type Mode="companies"|"deals"|"expansion"|"attraction"|"contraction"|"moves";
type Input={q?:string;country?:string;state?:string;county?:string;industry?:string;rank?:string;sort?:string;recency?:number;horizon?:number;governmentMin?:number};
const labels:Record<Mode,string>={companies:"Company Search",deals:"New Deals",expansion:"Company Expansion",attraction:"Attraction Search",contraction:"Contraction Risk",moves:"Potential Moves"};
const sections=["Company & activity","Geography","Funding & transactions","Signals & ranking"] as const;
const allStates=US_STATES as readonly (readonly [string,string])[];
export function ResearchCriteriaDialog({mode,action,initial={},industries=[]}:{mode:Mode;action:string;initial?:Input;industries?:{slug:string;name:string}[]}){
  const [open,setOpen]=useState(false);
  const [section,setSection]=useState<(typeof sections)[number]>("Company & activity");
  const [country,setCountry]=useState(initial.country||"US");
  const [state,setState]=useState(initial.state||"");
  const [county,setCounty]=useState(initial.county||"");
  const [query,setQuery]=useState(initial.q||"");
  const [industry,setIndustry]=useState(initial.industry||"");
  const [rank,setRank]=useState(initial.rank||"likelihood");
  const [period,setPeriod]=useState(String(initial.recency||180));
  const [horizon,setHorizon]=useState(String(initial.horizon||180));
  const [minValue,setMinValue]=useState(initial.governmentMin?.toString()||"");
  const [sort,setSort]=useState(initial.sort||"government_desc");
  const launch=useRef<HTMLButtonElement>(null);
  const dialog=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!open)return;
    const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);launch.current?.focus();}};
    window.addEventListener("keydown",onKey);
    const frame=requestAnimationFrame(()=>dialog.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus());
    return()=>{cancelAnimationFrame(frame);window.removeEventListener("keydown",onKey);};
  },[open]);
  const isDeal=mode==="deals";
  const isCompany=mode==="companies";
  const geographicScope=county?county+", "+(state||"US"):state?(allStates.find(s=>s[0]===state)?.[1]||state):"United States";
  const active=[country==="US"?"United States":country,state||"",county||"",industry||"",query?'"'+query+'"':""].filter(Boolean);
  function keepFocusInside(event:ReactKeyboardEvent<HTMLElement>){
    if(event.key!=="Tab")return;
    const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')||[]).filter(control=>control.getClientRects().length>0);
    if(!controls.length)return;
    const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  return <>
    <div className="bc-screener-launch">
      <div><span className="bc-microcopy">RESEARCH SCREENER</span><strong>{labels[mode]}</strong>
        <p>{isDeal?"Find verified capital events and corporate transactions where sources exist. Government contracts are shown separately.":"Build a structured search, review the criteria, and examine source-linked company results."}</p></div>
      <button type="button" ref={launch} className="bc-solid-btn" onClick={event=>{launch.current=event.currentTarget;setOpen(true);}}>＋ New search</button>
    </div>
    <div className="bc-criteria-current"><span>Current search</span><strong>{geographicScope}</strong>{query?<span> · {query}</span>:null}
    <button type="button" onClick={event=>{launch.current=event.currentTarget;setOpen(true);}}>Edit criteria ↗</button></div>
    {open?<div className="bc-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget){setOpen(false);launch.current?.focus();}}}>
      <section ref={dialog} className="bc-criteria-window" role="dialog" aria-modal="true" aria-label={labels[mode]+" criteria"} onKeyDown={keepFocusInside}>
        <div className="bc-criteria-header"><div><span className="bc-microcopy">FIRMQUARRY / ADVANCED SEARCH</span><h2>{labels[mode]} criteria</h2><p>Define a search before opening the results table.</p></div><button type="button" data-initial-focus aria-label="Close search criteria" onClick={()=>{setOpen(false);launch.current?.focus();}}>✕</button></div>
        <form method="get" action={action} className="bc-criteria-form">
          <input type="hidden" name={isDeal?"recipient":"q"} value={query}/><input type="hidden" name="country" value={country}/><input type="hidden" name="state" value={state}/><input type="hidden" name="county" value={county}/><input type="hidden" name="industry" value={industry}/><input type="hidden" name="sort" value={sort}/><input type="hidden" name="rank" value={rank}/><input type="hidden" name="recency" value={period}/><input type="hidden" name="horizon" value={horizon}/><input type="hidden" name="government_min" value={minValue}/>
          <aside className="bc-criteria-nav" aria-label="Filter categories">
            {sections.map(name=><button key={name} type="button" className={section===name?"active":""} onClick={()=>setSection(name)}>{name}<span aria-hidden="true">›</span></button>)}
          </aside>
          <div className="bc-criteria-body">
            {section==="Company & activity"?<div className="bc-criteria-fields"><h3>Company & activity</h3><p>Start broad, then narrow to the companies or activity you want to research.</p>
              <label>Company or keyword<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a company or legal name"/></label>
              {!isDeal?<label>Industry<select value={industry} onChange={e=>setIndustry(e.target.value)}><option value="">All industries</option>{industries.map(i=><option key={i.slug} value={i.slug}>{i.name}</option>)}</select></label>:<div className="bc-criteria-info">Corporate funding and M&A require independently verified transaction coverage. Public federal awards are not automatically treated as financing deals.</div>}
              {isCompany?<label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="government_desc">Government business</option><option value="latest_signal">Recent signal</option><option value="latest_change">Recent corporate change</option><option value="obligations_12m_desc">Last 12 months obligations</option><option value="company">Company name</option></select></label>:null}
            </div>:null}
            {section==="Geography"?<div className="bc-criteria-fields"><h3>Target geography</h3><p>{mode==="attraction"?"Choose the county or state you want to attract business into. In-market and out-of-market opportunities are differentiated where evidence supports them.":"Search by observed company geography. Recipient addresses and verified facilities are not interchangeable."}</p>
              <label>Country<select value={country} onChange={e=>{setCountry(e.target.value);setState("");setCounty("");}}><option value="US">United States</option><option value="ALL">All available countries</option></select></label>
              <label>State or territory<select value={state} onChange={e=>{setState(e.target.value);setCounty("");}}><option value="">All states</option>{allStates.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
              <label>County or parish<input value={county} onChange={e=>setCounty(e.target.value)} disabled={!state} placeholder={state?"Enter county or parish":"Choose a state first"}/></label>
            </div>:null}
            {section==="Funding & transactions"?<div className="bc-criteria-fields"><h3>Funding & transactions</h3>
              <p>Capital raised, acquisitions and investment announcements can support an expansion hypothesis, but never establish an intended location by themselves.</p>
              <label>Minimum reported U.S. government obligations (USD)<input type="number" min="0" step="1000" value={minValue} onChange={e=>setMinValue(e.target.value)} placeholder="No minimum"/></label>
              <div className="bc-criteria-info"><strong>Coverage note</strong><br/>Verified funding amount, equity round, announced destination, and transaction type will be filterable when those source records have been ingested and quality-checked. No simulated capital data is returned.</div>
            </div>:null}
            {section==="Signals & ranking"?<div className="bc-criteria-fields"><h3>Signals & ranking</h3>
              <p>{mode==="contraction"?"Prioritize verified WARN notices, facility closures, workforce reductions and financial distress. A reduction in contract obligations alone is not proof of downsizing.":"Calibrated likelihood appears only for a validated model; otherwise results display descriptive evidence strength."}</p>
              <label>Ranking<select value={rank} onChange={e=>setRank(e.target.value)}><option value="likelihood">Supported likelihood (if validated)</option><option value="evidence">Evidence strength</option><option value="recent">Most recent signal</option></select></label>
              <label>Signal recency<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="30">Past 30 days</option><option value="90">Past 90 days</option><option value="180">Past 180 days</option><option value="365">Past 12 months</option></select></label>
              <label>Forecast horizon<select value={horizon} onChange={e=>setHorizon(e.target.value)}><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></label>
            </div>:null}
          </div>
          <aside className="bc-criteria-summary"><span className="bc-microcopy">SEARCH SUMMARY</span><h3>What you're looking for</h3><strong>{labels[mode]}</strong><p>{geographicScope}</p><div>{active.map((v,i)=><span key={i}>{v}</span>)}</div>
            <small>Results only include the records covered by connected sources and your account's access. No data is generated for empty searches.</small></aside>
          <footer className="bc-criteria-footer"><button type="button" className="bc-outline-btn" onClick={()=>{setOpen(false);launch.current?.focus();}}>Cancel</button><button type="submit" className="bc-solid-btn">Show results →</button></footer>
        </form>
      </section>
    </div>:null}
  </>;
}
