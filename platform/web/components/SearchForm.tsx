import type { SearchInput } from "@/lib/search";

type Options = { agencies: string[]; subagencies: string[]; industries: Array<{ slug: string; name: string }> };

function value(value: string | number | undefined): string | number { return value ?? ""; }

export function SearchForm({ input, options }: { input: SearchInput; options: Options }) {
  return <form className="search-panel" action="/search" method="get">
    <div className="mode-tabs" role="group" aria-label="Search mode">
      <label><input type="radio" name="mode" value="companies" defaultChecked={input.mode === "companies"} /> Companies</label>
      <label><input type="radio" name="mode" value="contracts" defaultChecked={input.mode === "contracts"} /> Contracts</label>
    </div>
    <div className="query-row"><label><span>Search</span><input name="q" defaultValue={value(input.q)} placeholder="Company, description, award ID, buyer, classification…" /></label><label className="country-control"><span>Country</span><select name="country" defaultValue={input.country}><option value="US">United States</option><option value="GB">United Kingdom</option></select></label><button className="button primary" type="submit">Search database</button></div>
    <div className="filter-grid">
      <fieldset><legend>Company / recipient location</legend><div className="field-row">
        <label>State<input name="recipient_state" defaultValue={value(input.recipientState)} placeholder="MD" maxLength={2} /></label>
        <label>County FIPS<input name="recipient_county" defaultValue={value(input.recipientCounty)} placeholder="24031" /></label>
        <label>City<input name="recipient_city" defaultValue={value(input.recipientCity)} /></label>
        <label>ZIP<input name="recipient_zip" defaultValue={value(input.recipientZip)} /></label>
      </div></fieldset>
      <fieldset className="performance-fieldset"><legend>Place of performance <span>Pro</span></legend><div className="field-row">
        <label>State<input name="performance_state" defaultValue={value(input.performanceState)} placeholder="MD" maxLength={2} /></label>
        <label>County FIPS<input name="performance_county" defaultValue={value(input.performanceCounty)} placeholder="24031" /></label>
        <label>City<input name="performance_city" defaultValue={value(input.performanceCity)} /></label>
        <label>ZIP<input name="performance_zip" defaultValue={value(input.performanceZip)} /></label>
      </div></fieldset>
    </div>
    <details className="advanced-filters" open={Boolean(input.agency || input.industry || input.dateFrom || input.minValue)}><summary>Advanced filters</summary><div className="advanced-grid">
      <label>Award date from<input type="date" name="date_from" defaultValue={value(input.dateFrom)} /></label>
      <label>Award date to<input type="date" name="date_to" defaultValue={value(input.dateTo)} /></label>
      <label>Minimum value<input type="number" name="min_value" min="0" defaultValue={value(input.minValue)} /></label>
      <label>Maximum value<input type="number" name="max_value" min="0" defaultValue={value(input.maxValue)} /></label>
      <label>Agency<select name="agency" defaultValue={value(input.agency)}><option value="">All agencies</option>{options.agencies.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Subagency<select name="subagency" defaultValue={value(input.subagency)}><option value="">All subagencies</option>{options.subagencies.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Industry<select name="industry" defaultValue={value(input.industry)}><option value="">All industries</option>{options.industries.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
      <label>NAICS<input name="naics" defaultValue={value(input.naics)} /></label>
      <label>PSC<input name="psc" defaultValue={value(input.psc)} /></label>
      <label>Minimum prediction <span className="pro-chip">Pro</span><input type="number" name="prediction_min" min="0" max="1" step="0.05" defaultValue={value(input.predictionMin)} placeholder="0.65" /></label>
      {input.mode === "companies" ? <label>Minimum momentum <span className="pro-chip">Pro</span><input type="number" name="momentum_min" min="0" max="100" defaultValue={value(input.momentumMin)} placeholder="60" /></label> : null}
      <label>Sort by<select name="sort" defaultValue={input.sort}><option value="newest">Newest</option><option value="largest">Largest</option><option value="company">Company</option><option value="agency">Agency</option></select></label>
    </div></details>
  </form>;
}
