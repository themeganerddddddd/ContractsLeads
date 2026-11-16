import Link from "next/link";

/** Nationwide defaults are available without a database or location API. */
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

export type MarketFilterValues = {
  country?: string;
  state?: string;
  county?: string;
  city?: string;
  q?: string;
  industry?: string;
  recencyDays?: number;
  horizon?: number;
  rank?: string;
  governmentMin?: number;
};

export function marketHref(path: string, values: MarketFilterValues) {
  const params = new URLSearchParams();
  if (values.country && values.country !== "US") params.set("country", values.country);
  if (values.state) params.set("state", values.state);
  if (values.county) params.set("county", values.county);
  if (values.city) params.set("city", values.city);
  if (values.q) params.set("q", values.q);
  if (values.industry) params.set("industry", values.industry);
  if (values.rank && values.rank !== "likelihood") params.set("rank", values.rank);
  if (values.recencyDays && values.recencyDays !== 180) params.set("recency", String(values.recencyDays));
  if (values.horizon && values.horizon !== 180) params.set("horizon", String(values.horizon));
  if (values.governmentMin != null) params.set("government_min", String(values.governmentMin));
  return path + (params.size ? "?" + params.toString() : "");
}

type Props = {
  action: string;
  values: MarketFilterValues;
  industries?: { slug: string; name: string }[];
  knownCounties?: string[];
  otherStates?: string[];
  mode?: "radar" | "directory";
};

export function MarketFilterBar({
  action, values, industries = [], knownCounties = [], otherStates = [], mode = "radar",
}: Props) {
  const country = values.country || "US";
  const state = values.state || "";
  const stateOptions = new Map<string,string>(US_STATES.map(([abbrev,label])=>[abbrev,label] as const));
  if (country !== "US") for (const other of otherStates) {
    if (other && !stateOptions.has(other)) stateOptions.set(other,other);
  }
  if (state && !stateOptions.has(state)) stateOptions.set(state,state);
  const selectStates = country === "US"
    ? US_STATES.map(([v,l])=>[v,l] as const)
    : [...stateOptions].map(([v,l])=>[v,l] as const);
  const countyOptions = Array.from(new Set(knownCounties.filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  return <form className="market-filter-bar" action={action} method="get" role="search">
    <div className="market-filter-top">
      <div className="market-filter-title"><span className="market-filter-icon">⌕</span><div><strong>Search the market</strong><small>National → state → county</small></div></div>
      <p>County names use the reported company geography. Coverage varies by source.</p>
    </div>
    <div className="market-filter-fields">
      <label className="market-field market-field-search"><span>Company / keyword</span><input name="q" type="search" defaultValue={values.q||""} placeholder={mode === "radar" ? "Search companies or legal names" : "Search a company"} autoComplete="off" /></label>
      <label className="market-field"><span>Country</span><select name="country" defaultValue={country}>
        <option value="US">United States</option><option value="ALL">All countries</option>
        <option value="CA">Canada</option><option value="GB">United Kingdom</option><option value="FR">France</option><option value="DE">Germany</option>
      </select></label>
      <label className="market-field"><span>State / region</span><select name="state" defaultValue={state}>
        <option value="">All states</option>
        {selectStates.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="market-field"><span>County / parish</span><input name="county" list="market-county-options" defaultValue={values.county||""} placeholder="All counties" autoComplete="off" />
        <datalist id="market-county-options">{countyOptions.map(v=><option key={v} value={v}/>)}</datalist>
      </label>
      {mode === "radar" ? <label className="market-field market-field-sort"><span>Rank by</span><select name="rank" defaultValue={values.rank||"likelihood"}>
        <option value="likelihood">Most likely / strongest evidence</option>
        <option value="evidence">Strongest evidence</option>
        <option value="recent">Newest signals</option>
      </select></label> : null}
      <button type="submit" className="market-filter-submit">Apply filters <span aria-hidden="true">→</span></button>
    </div>
    <div className="market-filter-secondary">
      {mode === "radar" ? <>
        <label>Signal period <select name="recency" defaultValue={String(values.recencyDays||180)}>
          <option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">12 months</option>
        </select></label>
        <label>Model horizon <select name="horizon" defaultValue={String(values.horizon||180)}>
          <option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option>
        </select></label>
      </> : null}
      {industries.length ? <label>Industry <select name="industry" defaultValue={values.industry||""}>
        <option value="">All industries</option>
        {industries.map(i=><option key={i.slug} value={i.slug}>{i.name}</option>)}
      </select></label> : values.industry ? <input type="hidden" name="industry" value={values.industry}/> : null}
      {values.city ? <input type="hidden" name="city" value={values.city} /> : null}
      {values.governmentMin!=null ? <input type="hidden" name="government_min" value={String(values.governmentMin)}/> : null}
      <span className="market-filter-geonote">Select a state, then type a county name; available matches appear after filtering.</span>
      <Link className="market-filter-clear" href={action}>Reset all</Link>
    </div>
  </form>;
}
