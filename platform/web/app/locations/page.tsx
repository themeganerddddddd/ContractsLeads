import Link from "next/link";

import { CompanyTable } from "@/components/CompanyTable";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { MetricCard } from "@/components/MetricCard";
import { Pagination } from "@/components/Pagination";
import {
  getCompanyFilterOptions,
  parseCompanyScreenerInput,
  searchCompanySnapshots,
} from "@/lib/company-intelligence";
import { can } from "@/lib/entitlements";
import { resolveViewer } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Locations",
  description: "Find companies by country, state, county, city, and postal code.",
};

type RawParams = Record<string, string | string[] | undefined>;

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const input = parseCompanyScreenerInput({
    ...raw,
    country: raw.country || "US",
    sort: raw.sort || "government_desc",
  });
  try {
    const [viewer, options] = await Promise.all([
      resolveViewer(),
      getCompanyFilterOptions(input.country, input.state, input.county),
    ]);
    const result = await searchCompanySnapshots(input, viewer.plan, viewer.userId);
    const expansionCount = result.rows.filter((row) => row.expansion_score != null).length;
    const moveCount = result.rows.filter((row) => row.relocation_score != null).length;
    const contractionCount = result.rows.filter((row) => row.contraction_score != null).length;
    return (
      <>
        <section className="page-heading">
          <p className="eyebrow">Geographic company intelligence</p>
          <h1>Locations</h1>
          <p>
            Search BusinessCurrent by geography. Results lead with companies and
            preserve the difference between an operating location and an
            observed procurement recipient address.
          </p>
        </section>
        <form className="location-screener" action="/locations" method="get">
          <div className="location-filter-grid">
            <label>
              Country
              <select name="country" defaultValue={input.country || "US"}>
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
              County / Parish / Local Area
              <select name="county" defaultValue={input.county || ""}>
                <option value="">All counties / local areas</option>
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
              ZIP / Postal Code
              <input
                name="postal"
                defaultValue={input.postal}
                placeholder="70112"
                autoComplete="postal-code"
              />
            </label>
            <label>
              Industry
              <select name="industry" defaultValue={input.industry || ""}>
                <option value="">All industries</option>
                {options.industries.map((industry) => (
                  <option key={industry.slug} value={industry.slug}>
                    {industry.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="screener-actions">
            <button className="button primary" type="submit">
              View companies
            </button>
            <Link className="button secondary" href="/locations">
              Clear
            </Link>
          </div>
        </form>

        <section className="section location-results">
          <div className="section-header">
            <div>
              <p className="eyebrow">Companies first</p>
              <h2>Companies in this location</h2>
              <p>
                Signal counts below describe the visible page; the company count
                reflects every qualifying match.
              </p>
            </div>
          </div>
          <div className="metrics-grid compact-location-metrics">
            <MetricCard label="Companies" value={result.total.toLocaleString()} />
            <MetricCard label="Expansion signals" value={expansionCount.toLocaleString()} note="visible results" />
            <MetricCard label="Move signals" value={moveCount.toLocaleString()} note="visible results" />
            <MetricCard label="Contraction signals" value={contractionCount.toLocaleString()} note="visible results" />
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
        </section>
      </>
    );
  } catch (cause) {
    return (
      <>
        <section className="page-heading">
          <p className="eyebrow">Geographic company intelligence</p>
          <h1>Locations</h1>
        </section>
        <DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} />
      </>
    );
  }
}
