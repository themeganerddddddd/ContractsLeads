"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type MarketFilterValues } from "@/lib/market-filters";

export const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["DC","District of Columbia"],["FL","Florida"],
  ["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],
  ["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],
  ["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],
  ["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],
  ["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],
  ["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],
  ["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],
  ["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],
  ["WY","Wyoming"],["PR","Puerto Rico"],["GU","Guam"],["VI","U.S. Virgin Islands"],
] as const;

type Props = {
  action: string;
  values: MarketFilterValues;
  industries?: { slug:string; name:string }[];
  knownCounties?: string[];
  otherStates?: string[];
  mode?: "radar" | "directory";
};

export function MarketFilterBar({
  action, values, industries = [], knownCounties = [], otherStates = [], mode = "radar",
}: Props) {
  const [country, setCountry] = useState(values.country || "US");
  const [state, setState] = useState(values.state || "");
  const [county, setCounty] = useState(values.county || "");
  const [countyOptions, setCountyOptions] = useState<string[]>(knownCounties);
  const [countiesLoading, setCountiesLoading] = useState(false);
  const [keyword, setKeyword] = useState(values.q || "");
  const [showAdvanced, setShowAdvanced] = useState(Boolean(
    values.industry || values.governmentMin != null ||
    (mode === "radar" && (values.rank !== "likelihood" || (values.recencyDays && values.recencyDays !== 180) || (values.horizon && values.horizon !== 180)))
  ));
  const otherStatesSet = new Set<string>(US_STATES.map(([code]) => code));
  const regionOptions: {code: string; label: string}[] = country === "US"
    ? US_STATES.map(([code,label])=>({code,label}))
    : otherStates.filter(s=>!otherStatesSet.has(s)).map(code=>({code,label:code}));
  if(state && !regionOptions.some(r=>r.code===state))regionOptions.unshift({code:state,label:state});
  // Refresh available counties when a different state is selected; keep typed county fallback.
  useEffect(() => {
    if (!state || country !== "US") { setCountyOptions([]); setCountiesLoading(false); return; }
    const controller = new AbortController();
    setCountiesLoading(true);
    fetch(`/api/geography/counties?state=${encodeURIComponent(state)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("County options unavailable");
        return response.json() as Promise<{ counties?: string[] }>;
      })
      .then(data => setCountyOptions(Array.isArray(data.counties) ? data.counties : []))
      .catch(() => { if (!controller.signal.aborted) setCountyOptions(state === values.state ? knownCounties : []); })
      .finally(() => { if (!controller.signal.aborted) setCountiesLoading(false); });
    return () => controller.abort();
  }, [country, state]);
  const stateName = US_STATES.find(([code])=>code===state)?.[1] || state;
  return <form className="market-filter-bar bc-market-form" method="get" action={action} role="search">
    <div className="market-filter-top">
      <div className="market-filter-title"><span className="market-filter-icon" aria-hidden="true">⌕</span><div>
        <strong>Refine your search</strong>
        <small>Find companies and signals by market</small>
      </div></div>
      <div className="bc-filter-summary" aria-label="Selected geography">
        <span className="bc-filter-crumb">{country==="US"?"United States":country==="ALL"?"All countries":country}</span>
        {state?<span className="bc-filter-crumb">{stateName}</span>:null}
        {county?<span className="bc-filter-crumb">{county}</span>:null}
      </div>
    </div>
    <div className="market-filter-fields">
      <label className="market-field market-field-search"><span>Search</span>
        <input name="q" type="search" placeholder="Company or legal name" autoComplete="off" value={keyword}
          onChange={(e)=>setKeyword(e.target.value)} />
      </label>
      <label className="market-field"><span>Country</span>
        <select name="country" value={country} onChange={(e)=>{setCountry(e.target.value);setState("");setCounty("");}}>
          <option value="US">United States</option>
          <option value="ALL">All countries</option>
          <option value="CA">Canada</option>
          <option value="GB">United Kingdom</option>
          <option value="FR">France</option>
          <option value="DE">Germany</option>
        </select>
      </label>
      <label className="market-field"><span>State / region</span>
        <select name="state" value={state} onChange={(e)=>{setState(e.target.value);setCounty("");}}
          aria-describedby="bc-geography-help">
          <option value="">All states</option>
          {regionOptions.map(({code,label})=><option key={code} value={code}>{label}</option>)}
        </select>
      </label>
      <label className="market-field"><span>County / parish</span>
        <div className="fq-county-combobox">
          <input name="county" list="market-county-options" placeholder={state?"Type a county or choose →":"Choose a state first"}
            value={county} onChange={e=>setCounty(e.target.value)} autoComplete="off" disabled={!state}/>
          <select aria-label="Choose county or parish from list" value={countyOptions.includes(county) ? county : ""}
            onChange={e=>setCounty(e.target.value)} disabled={!state || countiesLoading || !countyOptions.length}>
            <option value="">{countiesLoading?"Loading…":countyOptions.length?"All counties ▾":"No listed counties"}</option>
            {countyOptions.map(value=><option key={value} value={value}>{value}</option>)}
          </select>
          <datalist id="market-county-options">{countyOptions.map(value=><option key={value} value={value}/>)}</datalist>
        </div>
      </label>
      <button type="submit" className="market-filter-submit">Search <span aria-hidden="true">↗</span></button>
    </div>
    <div className="fq-procurement-search" aria-label="Contract dollar thresholds and procurement baseline">
      <div className="fq-procurement-search-intro"><span className="bc-microcopy">PROCUREMENT BASELINE</span><small>Compare each firm with its own normal annual contract obligations—not a generic industry average.</small></div>
      <label>12-month net obligations ≥ <span>USD</span><input type="number" name="obligations_12m_min" min="0" step="1000" defaultValue={values.obligations12mMin ?? ""} placeholder="Any dollar amount" /></label>
      <label>Prior 3-year annual average ≥ <span>USD</span><input type="number" name="baseline_annual_min" min="0" step="1000" defaultValue={values.baselineAnnualMin ?? ""} placeholder="Any baseline" /></label>
      <label>Change vs company baseline<select name="baseline_trend" defaultValue={values.baselineTrend||""}><option value="">Any change</option><option value="above">25%+ above (at least $250k)</option><option value="below">25%+ below (at least $250k)</option></select></label>
    </div>
    <div className="market-filter-secondary">
      <details className="market-filter-advanced" open={showAdvanced} onToggle={e=>setShowAdvanced(e.currentTarget.open)}>
        <summary>Advanced filters <span className="bc-advanced-description">Industry · date · ranking</span></summary>
        <div className="market-filter-advanced-body">
          {mode === "radar" ? <>
            <label>Rank results
              <select name="rank" defaultValue={values.rank||"likelihood"}>
                <option value="likelihood">Highest supported likelihood</option>
                <option value="evidence">Strongest evidence</option>
                <option value="recent">Most recent activity</option>
              </select>
            </label>
            <label>Signal period
              <select name="recency" defaultValue={String(values.recencyDays ?? 0)}>
                <option value="0">All available signal history</option>
                <option value="30">30 days</option><option value="90">90 days</option>
                <option value="180">6 months</option><option value="365">12 months</option><option value="730">24 months</option>
              </select>
            </label>
            <label>Forecast horizon
              <select name="horizon" defaultValue={String(values.horizon||0)}>
                <option value="0">Any validated horizon</option>
                <option value="90">90 days</option><option value="180">6 months</option>
                <option value="365">12 months</option>
              </select>
            </label>
          </>: <label>Order results
            <select name="sort" defaultValue={values.sort||"government_desc"}>
              <option value="government_desc">Government Business — largest</option>
              <option value="obligations_12m_desc">12M net obligations</option>
              <option value="latest_signal">Latest signal</option>
              <option value="company">Company name</option>
            </select>
          </label>}
          {industries.length ? <label>Industry
            <select name="industry" defaultValue={values.industry||""}>
              <option value="">All industries</option>
              {industries.map(i=><option key={i.slug} value={i.slug}>{i.name}</option>)}
            </select>
          </label> : values.industry ? <input type="hidden" name="industry" value={values.industry}/> : null}
          {values.city ? <input type="hidden" name="city" value={values.city}/> : null}
          {values.governmentMin!=null ? <input type="hidden" name="government_min" value={String(values.governmentMin)}/> : null}
        </div>
      </details>
      <span id="bc-geography-help" className="market-filter-geonote">County / Parish / Local Area: select a state before narrowing to a county.</span>
      <Link href={action} className="market-filter-clear">Clear filters</Link>
    </div>
  </form>;
}
