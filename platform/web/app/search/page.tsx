import Link from "next/link";
import { AwardTable } from "@/components/AwardTable";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { Pagination } from "@/components/Pagination";
import { PaywallNotice } from "@/components/PaywallNotice";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { SearchForm } from "@/components/SearchForm";
import { compactMoney, dateLabel, reported } from "@/lib/format";
import { can } from "@/lib/entitlements";
import { resolvePlan } from "@/lib/plan";
import { getFilterOptions } from "@/lib/profiles";
import {
  parseSearchInput,
  searchCompanies,
  searchContracts,
} from "@/lib/search";

export const dynamic = "force-dynamic";
type RawParams = Record<string, string | string[] | undefined>;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const input = parseSearchInput(raw);
  try {
    const plan = await resolvePlan();
    const [options, result] = await Promise.all([
      getFilterOptions(),
      input.mode === "companies"
        ? searchCompanies(input, plan)
        : searchContracts(input, plan),
    ]);
    const exportParams = new URLSearchParams();
    Object.entries(raw).forEach(([key, item]) => {
      const scalar = Array.isArray(item) ? item[0] : item;
      if (scalar) exportParams.set(key, scalar);
    });
    return (
      <>
        <section className="page-heading">
          <p className="eyebrow">{input.mode === "companies" ? "BusinessCurrent company directory" : "Government Business"}</p>
          <h1>{input.mode === "companies" ? "Search companies" : "Search government business"}</h1>
          <p>
            {input.mode === "companies"
              ? "Find companies by name, industry, and observed recipient location, then inspect locations, changes, timelines, and source evidence."
              : "Search U.S. federal awards, UK Find a Tender processes, and EU TED notices while keeping native identifiers, currencies, countries, and official source links intact."}
          </p>
        </section>
        <SearchForm input={input} options={options} />
        {result.performanceLocked ? (
          <PaywallNotice title="Place-of-performance search is a Pro capability">
            A five-result preview is shown. Upgrade to Pro for full results,
            complete history, and geography comparisons.
          </PaywallNotice>
        ) : null}
        {result.historyRestricted ? (
          <PaywallNotice
            title={`${plan[0].toUpperCase()}${plan.slice(1)} plan history limit applied`}
          >
            The requested date range was shortened to the history available on
            your current plan.
          </PaywallNotice>
        ) : null}
        {result.intelligenceLocked ? (
          <PaywallNotice title="Prediction and momentum filters require Pro">
            The filter was not applied. Probability filters only use calibrated,
            sufficient model outputs.
          </PaywallNotice>
        ) : null}
        <div className="results-toolbar">
          <div>
            <h2>
              {result.visibleTotal.toLocaleString()} visible {input.mode}
            </h2>
            <p>
              {result.total.toLocaleString()} total matches
              {result.resultLimited
                ? ` · Showing ${result.visibleTotal.toLocaleString()} on ${plan}`
                : ""}
            </p>
          </div>
          <div className="inline-actions">
            {input.mode === "contracts" && can(plan, "csv_export") ? (
              <a
                className="button secondary"
                href={`/api/export?${exportParams}`}
              >
                Export CSV
              </a>
            ) : null}
            <SaveSearchButton query={input} />
          </div>
        </div>
        {input.mode === "contracts" ? (
          <AwardTable rows={result.rows as any[]} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Country / recipient location</th>
                  <th>Industry</th>
                  <th>Processes</th>
                  <th>Disclosed native activity</th>
                  <th>Latest award</th>
                  <th>Observed-activity index</th>
                  <th>Outlook</th>
                </tr>
              </thead>
              <tbody>
                {(result.rows as any[]).map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        className="primary-cell"
                        href={`/company/${row.slug}`}
                      >
                        {row.canonical_name}
                      </Link>
                      {row.is_demo ? (
                        <span className="demo-pill">Demo</span>
                      ) : null}
                      <small>{reported(row.uei)}</small>
                    </td>
                    <td>
                      {reported(
                        [
                          row.source_country,
                          row.recipient_city,
                          row.recipient_county,
                          row.recipient_state,
                          row.recipient_zip,
                        ]
                          .filter(Boolean)
                          .join(", "),
                      )}
                    </td>
                    <td>{reported(row.industry_name)}</td>
                    <td>{Number(row.award_count).toLocaleString()}</td>
                    <td className="numeric">
                      {row.total_activity == null
                        ? "Mixed or not reported"
                        : row.currency && row.currency !== "USD"
                          ? `${row.currency} ${Number(row.total_activity).toLocaleString()}`
                          : compactMoney(row.total_activity)}
                    </td>
                    <td>{dateLabel(row.latest_award)}</td>
                    <td>
                      {row.momentum_score == null
                        ? "Insufficient history"
                        : `${row.momentum_score}/100`}
                    </td>
                    <td>
                      {row.prediction_sufficiency === "sufficient" &&
                      row.prediction_probability != null
                        ? `${Math.round(Number(row.prediction_probability) * 100)}%`
                        : "Insufficient history"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.visibleTotal}
          params={raw}
        />
      </>
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return (
      <>
        <section className="page-heading">
          <p className="eyebrow">Government Business</p>
          <h1>{input.mode === "companies" ? "Search companies" : "Search government business"}</h1>
        </section>
        <DatabaseNotice message={message} />
      </>
    );
  }
}
