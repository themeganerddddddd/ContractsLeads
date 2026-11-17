import Link from "next/link";

import { DatabaseNotice } from "@/components/DatabaseNotice";
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

type RawParams = Record<string, string | string[] | undefined>;

const CONTENT: Record<
  PredictionKind,
  { title: string; purpose: string; assessment: "expansion" | "relocation" | "contraction" }
> = {
  expansion: {
    title: "Predicted Expansion",
    purpose: "Find companies showing evidence that they may expand.",
    assessment: "expansion",
  },
  moves: {
    title: "Predicted Moves",
    purpose:
      "Find companies that may relocate, add a location, or materially change their geographic footprint.",
    assessment: "relocation",
  },
  contraction: {
    title: "Predicted Contraction",
    purpose: "Find companies showing evidence that operations may shrink or close.",
    assessment: "contraction",
  },
};

function assessment(row: PredictionCompanyRow, kind: PredictionKind) {
  if (kind === "expansion")
    return {
      score: row.expansion_score,
      date: row.expansion_date,
      sufficiency: row.expansion_sufficiency,
      components: row.expansion_components,
      explanation: row.expansion_explanation,
    };
  if (kind === "moves")
    return {
      score: row.relocation_score,
      date: row.relocation_date,
      sufficiency: row.relocation_sufficiency,
      components: row.relocation_components,
      explanation: row.relocation_explanation,
    };
  return {
    score: row.contraction_score,
    date: row.contraction_date,
    sufficiency: row.contraction_sufficiency,
    components: row.contraction_components,
    explanation: row.contraction_explanation,
  };
}

function evidenceLabel(components: Record<string, unknown> | null) {
  const items = Array.isArray(components?.items) ? components.items : [];
  const first = items[0];
  if (first && typeof first === "object" && "label" in first)
    return String(first.label);
  return "Source-backed activity pattern";
}

function destinationLabel(components: Record<string, unknown> | null) {
  if (!components?.destination_claim_supported) return "Destination unknown";
  const destination = components.destination;
  if (!destination || typeof destination !== "object") return "Destination unknown";
  const values = Object.values(destination).filter(Boolean).map(String);
  return values.length ? values.join(", ") : "Destination unknown";
}

function Outlook({ row, kind }: { row: PredictionCompanyRow; kind: PredictionKind }) {
  const item = assessment(row, kind);
  const calibrated =
    row.probability_eligible === true &&
    row.model_status === "active" &&
    row.prediction_sufficiency === "sufficient" &&
    row.probability != null;
  return (
    <div className="outlook-cell">
      <strong>
        {calibrated
          ? `${Math.round(Number(row.probability) * 100)}% probability`
          : indicationLabel(item.score, item.sufficiency || undefined)}
      </strong>
      <small>
        {calibrated
          ? `${row.horizon_days}-day calibrated model`
          : "Prediction not yet available"}
      </small>
      <small>As of {dateLabel(item.date)}</small>
    </div>
  );
}

export async function PredictionScreener({
  kind,
  searchParams,
}: {
  kind: PredictionKind;
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const input = parsePredictionInput(raw);
  const copy = CONTENT[kind];
  try {
    const [viewer, options] = await Promise.all([
      resolveViewer(),
      getCompanyFilterOptions(input.country, input.state, input.county),
    ]);
    const result = await searchPredictionCompanies(kind, input, viewer.plan, viewer.userId);
    const hasCalibratedPrediction = result.rows.some((row) =>
      row.probability_eligible === true &&
      row.model_status === "active" &&
      row.prediction_sufficiency === "sufficient" &&
      row.probability != null
    );
    return (
      <>
        <section className="page-heading prediction-heading">
          <p className="eyebrow">Company outlook</p>
          <h1>{copy.title}</h1>
          <p>{copy.purpose}</p>
          <div className="prediction-safety-note">
            <strong>Signal mode</strong>
            <span>
              {hasCalibratedPrediction
                ? "Validated probabilities are labeled individually; all other rankings are descriptive evidence signals."
                : "No calibrated model currently passes the probability gate for this product. Rankings below are descriptive evidence signals, not event probabilities."}
            </span>
          </div>
        </section>
        <form className="prediction-filters" method="get">
          <div className="screener-filter-grid">
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
              Prediction horizon
              <select name="horizon" defaultValue={input.horizon?.toString()}>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">365 days</option>
              </select>
            </label>
            <label>
              Signal recency
              <select name="recency" defaultValue={input.recencyDays?.toString()}>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">365 days</option>
              </select>
            </label>
            <label>
              Government Business
              <select name="government_min" defaultValue={input.governmentMin?.toString() || ""}>
                <option value="">Any amount</option>
                <option value="100000">$100K+</option>
                <option value="1000000">$1M+</option>
                <option value="10000000">$10M+</option>
                <option value="100000000">$100M+</option>
              </select>
            </label>
          </div>
          <div className="screener-actions">
            <button className="button primary" type="submit">
              Apply filters
            </button>
            <Link className="button secondary" href={
              kind === "expansion"
                ? "/predicted-expansion"
                : kind === "moves"
                  ? "/predicted-moves"
                  : "/predicted-contraction"
            }>
              Clear
            </Link>
          </div>
        </form>

        {result.resultLimited ? (
          <PaywallNotice title={`Showing ${result.visibleTotal.toLocaleString()} signal results`}>
            Pro unlocks the full signal screener and validated prediction filters
            when a model becomes eligible.
          </PaywallNotice>
        ) : null}
        <div className="results-toolbar">
          <div>
            <h2>{result.visibleTotal.toLocaleString()} visible companies</h2>
            <p>{result.total.toLocaleString()} matching source-backed signals</p>
          </div>
        </div>
        <div className="table-wrap prediction-table-wrap">
          <table className="data-table prediction-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Industry</th>
                <th scope="col">{kind === "moves" ? "Current Location" : "Location"}</th>
                <th scope="col">{copy.assessment[0].toUpperCase() + copy.assessment.slice(1)} Outlook</th>
                {kind === "moves" ? <th scope="col">Potential Destination</th> : null}
                <th scope="col">Supporting Evidence</th>
                {kind !== "moves" ? <th scope="col">Government Business</th> : null}
                {kind === "expansion" ? <th scope="col">12M Net Obligations</th> : null}
                <th scope="col">Latest Signal</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const item = assessment(row, kind);
                return (
                  <tr key={row.id}>
                    <td>
                      <Link className="primary-cell" href={`/company/${row.slug}`}>
                        {row.canonical_name}
                      </Link>
                    </td>
                    <td>{reported(row.industry_name)}</td>
                    <td>{reported(row.location_label)}<small>{row.location_basis}</small></td>
                    <td><Outlook row={row} kind={kind} /></td>
                    {kind === "moves" ? <td>{destinationLabel(item.components)}</td> : null}
                    <td>{evidenceLabel(item.components)}<small>{item.explanation || "Evidence score retained with the company profile."}</small></td>
                    {kind !== "moves" ? <td className="numeric">{compactMoney(row.government_business)}</td> : null}
                    {kind === "expansion" ? <td className="numeric">{compactMoney(row.obligations_12m)}</td> : null}
                    <td>{copy.assessment} signal<small>{dateLabel(item.date)}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!result.rows.length ? (
          <div className="empty-panel">
            <strong>No companies match these signal filters.</strong>
            <p>Try a longer signal-recency window or broader geography.</p>
          </div>
        ) : null}
        <Pagination page={result.page} pageSize={result.pageSize} total={result.visibleTotal} params={raw} />
      </>
    );
  } catch (cause) {
    return (
      <>
        <section className="page-heading">
          <p className="eyebrow">Company outlook</p>
          <h1>{copy.title}</h1>
        </section>
        <DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} />
      </>
    );
  }
}

