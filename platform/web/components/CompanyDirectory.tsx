import Link from "next/link";
import { CompanyTable } from "@/components/CompanyTable";
import { MarketFilterBar } from "@/components/MarketFilterBar";
import { Pagination } from "@/components/Pagination";
import { PaywallNotice } from "@/components/PaywallNotice";
import { getCompanyFilterOptions, parseCompanyScreenerInput, searchCompanySnapshots } from "@/lib/company-intelligence";
import { resolveViewer } from "@/lib/plan";

type RawParams=Record<string,string|string[]|undefined>;
export async function CompanyDirectory({searchParams,locationFocus=false}:{
  searchParams:Promise<RawParams>;locationFocus?:boolean;
}){
  const raw=await searchParams;
  const input=parseCompanyScreenerInput(raw);
  const values={...input};
  const path=locationFocus?"/locations":"/companies";
  let result:Awaited<ReturnType<typeof searchCompanySnapshots>>|null=null;
  let viewer:Awaited<ReturnType<typeof resolveViewer>>|null=null;
  let options:Awaited<ReturnType<typeof getCompanyFilterOptions>>|null=null;
  let offline=!process.env.DATABASE_URL;
  if(!offline)try {
    const [v,opts]=await Promise.all([resolveViewer(),getCompanyFilterOptions(input.country==="ALL"?undefined:input.country,input.state,input.county)]);
    viewer=v;
    options=opts;
    result=await searchCompanySnapshots(input,v.plan,v.userId);
  }catch{offline=true;}
  return <div className="terminal-view terminal-directory">
    <section className="terminal-heading">
      <div className="terminal-heading-main">
        <p className="terminal-eyebrow"><span className="terminal-greenline"/> BUSINESSCURRENT / NATIONAL COMPANY INDEX</p>
        <h1>{locationFocus?"Explore companies by geography.":"Research companies, not cards."}</h1>
        <p>{locationFocus
          ?"Search from the United States down to a state, county or parish. Reported company locations are not necessarily the locations of contract performance."
          :"Search by company or legal name and screen for government activity, industry and supported corporate changes. Scan the results like an institutional research database."}</p>
      </div>
      <div className="terminal-heading-right"><span className="terminal-scope-label">DEFAULT MARKET</span>
        <strong>{input.county?`${input.county}, ${input.state||"US"}`:input.state?`${input.state} / all counties`:input.country==="US"?"United States":input.country==="ALL"?"All countries":input.country}</strong>
        <span className="terminal-status-badge">{offline?"Source not connected":"Company data connected"}</span></div>
    </section>
    <nav className="terminal-radar-tabs terminal-directory-tabs" aria-label="Research areas">
      <Link href="/companies" className={!locationFocus?"is-current":""} aria-current={!locationFocus?"page":undefined}>Company index</Link>
      <Link href="/locations" className={locationFocus?"is-current":""} aria-current={locationFocus?"page":undefined}>Locations</Link>
      <Link href="/predicted-expansion">Expansion ↗</Link><Link href="/predicted-contraction">Retention ↗</Link>
      <Link href="/contracts">Contracts ↗</Link>
    </nav>
    <MarketFilterBar action={path} values={values} mode="directory" industries={options?.industries}
      knownCounties={options?.counties||[]} otherStates={options?.states}/>
    <section className="terminal-result-pane">
      <div className="terminal-result-head">
        <div><p className="terminal-eyebrow">{locationFocus?"GEOGRAPHIC INDEX":"COMPANY COVERAGE"} / SORTABLE SOURCE DATA</p>
          <h2>Companies matching your market</h2>
          <p>{offline?"The searchable company index will appear when its data source is connected.": "Company identity, headquarters geography and work locations remain separate. Values are disclosed obligations, not revenue."}</p>
        </div>
        {!offline ? <div className="terminal-result-meta"><strong>{(result?.visibleTotal||0).toLocaleString()}</strong><span>visible matches</span></div> : null}
      </div>
      {offline ? <div className="terminal-ranking-placeholder" role="status">
        <span className="terminal-ranking-placeholder-icon" aria-hidden="true">◌</span>
        <div className="terminal-ranking-placeholder-content">
          <strong>Company index temporarily unavailable</strong>
          <p>Connection to the nationwide company dataset is offline. The archived source library remains available separately; it is not a substitute for national search coverage.</p>
        </div>
        <Link href="/public-records" className="terminal-ranking-source-link">Source library <span aria-hidden="true">↗</span></Link>
      </div> : <>
        {result?.resultLimited?<PaywallNotice title={`Showing ${result.visibleTotal.toLocaleString()} companies`}>Additional company records and full historical analysis depend on your plan.</PaywallNotice>:null}
        <CompanyTable rows={result?.rows||[]} canTrack={Boolean(viewer?.user)}/>
        {result?<Pagination page={result.page} pageSize={result.pageSize} total={result.visibleTotal} params={raw}/>:null}
      </>}
    </section>
    <div className="terminal-method-note"><strong>Research note</strong><p>County filters use supported company or recipient geography. They do not establish that a company operates a verified facility in every location where it has a federal contract. <Link href="/methodology">See methodology ↗</Link></p></div>
  </div>;
}
