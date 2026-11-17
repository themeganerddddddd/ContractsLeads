import Link from "next/link";

import { CompanyTable } from "@/components/CompanyTable";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { Pagination } from "@/components/Pagination";
import { PaywallNotice } from "@/components/PaywallNotice";
import {
  getCompanyFilterOptions,
  parseCompanyScreenerInput,
  searchCompanySnapshots,
} from "@/lib/company-intelligence";
import { can } from "@/lib/entitlements";
import { resolveViewer } from "@/lib/plan";

type RawParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Companies",
  description:
    "Screen companies by industry, geography, business change, government business, and source-backed signals.",
};

const GOVERNMENT_THRESHOLDS = [
  ["", "Any amount"],
  ["100000", "$100K+"],
  ["1000000", "$1M+"],
  ["10000000", "$10M+"],
  ["100000000", "$100M+"],
  ["1000000000", "$1B+"],
] as const;

const CHANGE_OPTIONS = [
  ["", "Any change"],
  ["opening", "Opening"],
  ["growing", "Growing"],
  ["expansion", "Expansion"],
  ["moving", "Moving"],
  ["shrinking", "Shrinking / Contraction"],
  ["closing", "Closing"],
  ["new_business", "New Business"],
] as const;

const SIGNAL_OPTIONS = [
  ["", "Any signal"],
  ["expansion", "Expansion signal"],
  ["move", "Move signal"],
  ["contraction", "Contraction signal"],
  ["award_increased", "Award increased"],
  ["award_decreased", "Award decreased"],
] as const;

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const input = parseCompanyScreenerInput(raw);
  try {
    const [viewer, options] = await Promise.all([
      resolveViewer(),
      getCompanyFilterOptions(input.country, input.state, input.county),
    ]);
    const result = await searchCompanySnapshots(input, viewer.plan, viewer.userId);
    const advancedOpen = Boolean(
      input.county ||
        input.city ||
        input.obligations12mMin != null ||
        input.knownLocations != null ||
        input.trackedOnly,
    );
    return (
      <>
        <section className="page-heading screener-heading">
          <p className="eyebrow">BusinessCurrent company intelligence</p>
          <h1>Companies</h1>
          <p>
            Search the customer-ready company universe, then narrow it by
            industry, location, business change, and disclosed government
            activity. Negative-only procurement records never create a company
            result.
          </p>
        </section>

        <form className="company-screener" action="/companies" method="get">
          <div className="company-search-field">
            <label htmlFor="company-q">Search companies</label>
            <div>
              <input
                id="company-q"
                name="q"
                defaultValue={input.q}
                placeholder="Search by company or legal name…"
                autoComplete="organization"
              />
              <button className="button primary" type="submit">
                Search
              </button>
            </div>
          </div>
          <div className="screener-filter-grid primary-company-filters">
            <label>
              Company Industry
              <select name="industry" defaultValue={input.industry || ""}>
                <option value="">All industries</option>
                {options.industries.map((industry) => (
                  <option key={industry.slug} value={industry.slug}>
                    {industry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Country
              <select name="country" defaultValue={input.country || ""}>
                <option value="">All countries</option>
                {options.countries.map((country) => (
                  <option key={country.value} value={country.value}>
                    {country.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              State / Region
              <select name="state" defaultValue={input.state || ""}>
                <option value="">All states / regions</option>
                {options.states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Business Change
              <select name="change" defaultValue={input.change || ""}>
                {CHANGE_OPTIONS.map(([value, label]) => (
                  <option key={value || "all"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Government Business
              <select
                name="government_min"
                defaultValue={input.governmentMin?.toString() || ""}
              >
                {GOVERNMENT_THRESHOLDS.map(([value, label]) => (
                  <option key={value || "all"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Latest Signal
              <select
                name="latest_signal"
                defaultValue={input.latestSignal || ""}
              >
                {SIGNAL_OPTIONS.map(([value, label]) => (
                  <option key={value || "all"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="advanced-company-filters" open={advancedOpen}>
            <summary>Advanced filters</summary>
            <div className="screener-filter-grid">
              <label>
                County / Parish
                <select name="county" defaultValue={input.county || ""}>
                  <option value="">All counties / parishes</option>
                  {options.counties.map((county) => (
                    <option key={county} value={county}>
                      {county}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                City
                <select name="city" defaultValue={input.city || ""}>
                  <option value="">All cities</option>
                  {options.cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Minimum 12M Net Obligations
                <input
                  type="number"
                  name="obligations_12m_min"
                  step="1000"
                  defaultValue={input.obligations12mMin}
                  placeholder="1000000"
                />
              </label>
              <label>
                Known Locations
                <select
                  name="known_locations"
                  defaultValue={input.knownLocations?.toString() || ""}
                >
                  <option value="">Any count</option>
                  <option value="1">1+</option>
                  <option value="2">2+</option>
                  <option value="5">5+</option>
                  <option value="10">10+</option>
                </select>
              </label>
              <label className="checkbox-filter">
                <input
                  type="checkbox"
                  name="tracked"
                  value="true"
                  defaultChecked={input.trackedOnly}
                />
                Tracked only
              </label>
            </div>
          </details>
          <div className="screener-actions">
            <button className="button primary" type="submit">
              Apply filters
            </button>
            <Link className="button secondary" href="/companies">
              Clear
            </Link>
          </div>
        </form>

        {result.resultLimited ? (
          <PaywallNotice title={`Showing the first ${result.visibleTotal.toLocaleString()} companies`}>
            Upgrade to Starter for the full ordinary result set and five years
            of history.
          </PaywallNotice>
        ) : null}

        <div className="results-toolbar company-results-toolbar">
          <div>
            <h2>{result.visibleTotal.toLocaleString()} visible companies</h2>
            <p>
              {result.total.toLocaleString()} qualifying matches · Money values
              are disclosed U.S. obligations, not company revenue.
            </p>
          </div>
          <form action="/companies" method="get" className="sort-form">
            {Object.entries(raw).map(([key, value]) => {
              const scalar = Array.isArray(value) ? value[0] : value;
              return key !== "sort" && key !== "page" && scalar ? (
                <input key={key} type="hidden" name={key} value={scalar} />
              ) : null;
            })}
            <label>
              Sort
              <select name="sort" defaultValue={input.sort}>
                <option value="government_desc">Government Business — largest</option>
                <option value="obligations_12m_desc">12M Net Obligations — largest</option>
                <option value="latest_signal">Latest Signal</option>
                <option value="latest_change">Latest Change</option>
                <option value="company">Company Name</option>
              </select>
            </label>
            <button className="button secondary" type="submit">
              Sort
            </button>
          </form>
        </div>
        <CompanyTable
          rows={result.rows}
          canTrack={Boolean(viewer.user && can(viewer.plan, "company_watches"))}
        />
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.visibleTotal}
          params={raw}
        />
      </>
    );
  } catch (cause) {
    return (
      <>
        <section className="page-heading">
          <p className="eyebrow">BusinessCurrent company intelligence</p>
          <h1>Companies</h1>
        </section>
        <DatabaseNotice
          message={cause instanceof Error ? cause.message : String(cause)}
        />
      </>
    );
  }
}
