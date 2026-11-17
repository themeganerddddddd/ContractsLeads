import Link from "next/link";
import { CompanyTable } from "@/components/CompanyTable";
import { ResearchCriteriaDialog } from "@/components/ResearchCriteriaDialog";
import { RankingsEmptyState } from "@/components/RankingsEmptyState";
import { Pagination } from "@/components/Pagination";
import { PaywallNotice } from "@/components/PaywallNotice";
import { getCompanyFilterOptions, parseCompanyScreenerInput, searchCompanySnapshots } from "@/lib/company-intelligence";
import { resolveViewer } from "@/lib/plan";
import { marketHref } from "@/lib/market-filters";

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
        <p className="terminal-eyebrow"><span className="terminal-greenline"/> FIRMQUARRY / NATIONAL COMPANY INDEX</p>
        <h1>{locationFocus?"Company locations":"Company directory"}</h1>
        <p>{locationFocus
          ?"Search from the United States down to a state, county or parish. Reported company locations are not necessarily the locations of contract performance."
          :"Search by company or legal name and screen for government activity, industry and supported corporate changes. Scan the results like an institutional research database."}</p>
      </div>
      <div className="terminal-heading-right"><span className="terminal-scope-label">DEFAULT MARKET</span>
        <strong>{input.county?`${input.county}, ${input.state||"US"}`:input.state?`${input.state} / all counties`:input.country==="US"?"United States":input.country==="ALL"?"All countries":input.country}</strong>
</div>
    </section>
    <nav className="terminal-radar-tabs terminal-directory-tabs" aria-label="Research areas">
      <Link href={marketHref("/companies",values)} className={!locationFocus?"is-current":""} aria-current={!locationFocus?"page":undefined}>Company index</Link>
      <Link href={marketHref("/locations",values)} className={locationFocus?"is-current":""} aria-current={locationFocus?"page":undefined}>Locations</Link>
      <Link href={marketHref("/predicted-expansion",values)}>Expansion intelligence</Link>
      <Link href={marketHref("/predicted-moves",values)}>Movement intelligence</Link>
      <Link href={marketHref("/predicted-contraction",values)}>Retention intelligence</Link>
    </nav>
    <ResearchCriteriaDialog mode="companies" action={path} initial={values} industries={options?.industries||[]}/>
    <section className="terminal-result-pane">
      <div className="terminal-result-head">
        <div><p className="terminal-eyebrow">{locationFocus?"GEOGRAPHIC INDEX":"COMPANY COVERAGE"} / SORTABLE SOURCE DATA</p>
          <h2>Companies matching your market</h2>
          <p>{offline?"The searchable company index will appear when its data source is connected.": "Company identity, headquarters geography and work locations remain separate. Values are disclosed obligations, not revenue."}</p>
        </div>
        {!offline ? <div className="terminal-result-meta"><strong>{(result?.visibleTotal||0).toLocaleString()}</strong><span>visible matches</span></div> : null}
      </div>
      {offline ? <RankingsEmptyState variant="companies"/> : <>
        {result?.resultLimited?<PaywallNotice title={`Showing ${result.visibleTotal.toLocaleString()} companies`}>Additional company records and full historical analysis depend on your plan.</PaywallNotice>:null}
        <CompanyTable rows={result?.rows||[]} canTrack={Boolean(viewer?.user)}/>
        {result?<Pagination page={result.page} pageSize={result.pageSize} total={result.visibleTotal} params={raw}/>:null}
      </>}
    </section>
    <div className="terminal-method-note"><strong>Research note</strong><p>County filters use supported company or recipient geography. They do not establish that a company operates a verified facility in every location where it has a federal contract. <Link href="/methodology">See methodology ↗</Link></p></div>
  </div>;
}
