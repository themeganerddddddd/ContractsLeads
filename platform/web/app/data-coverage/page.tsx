import Link from "next/link";

import { MetricCard } from "@/components/MetricCard";
import { getBusinessChangeCoverage } from "@/lib/business-change";
import { COVERAGE_FAMILIES, getNationalCoverage, STATES, type CoverageFamily, type NationalCoverageRow } from "@/lib/coverage";

export const dynamic = "force-dynamic";
export const metadata = { title: "National Data Coverage", description: "Know exactly where BusinessCurrent can see across all 50 states and DC." };

const FAMILY_LABELS: Record<CoverageFamily, string> = {
  registrations: "Registrations",
  licenses: "Licenses",
  permits: "Permits",
  occupancy: "Occupancy",
  warn: "WARN",
  economic_development: "Economic development",
  government_business: "Government business",
};

function cell(row: NationalCoverageRow | undefined) {
  if (!row) return <span className="coverage-state status-planned">Planned</span>;
  const label = row.coverage_status.replaceAll("_", " ");
  const content = <span className={`coverage-state status-${row.coverage_status}`} title={row.known_limitations}>{label}</span>;
  return row.source_url ? <a href={row.source_url} target="_blank" rel="noreferrer" aria-label={`${row.state_code} ${FAMILY_LABELS[row.source_family]}: ${label}`}>{content}</a> : content;
}

export default async function DataCoveragePage() {
  const [national, sources] = await Promise.all([
    getNationalCoverage(),
    getBusinessChangeCoverage().catch(() => []),
  ]);
  const activeLocal = new Set(national.rows.filter((row) => row.source_family !== "government_business" && ["active", "partial", "available"].includes(row.coverage_status)).map((row) => row.state_code));
  const productionAdapters = national.rows.filter((row) => row.automation_status === "production").length;
  const matrix = new Map(national.rows.map((row) => [`${row.state_code}:${row.source_family}`, row]));

  return <>
    <section className="page-heading coverage-heading"><p className="eyebrow">Transparent national coverage</p><h1>Know exactly where BusinessCurrent can see.</h1><p>Federal evidence is nationwide. State and local depth is built source by source, with reuse terms, automation status, refresh cadence, and limitations kept visible.</p></section>
    <div className="metrics-grid coverage-metrics"><MetricCard label="States + DC tracked" value={STATES.length.toString()} note="every source family has an explicit status" /><MetricCard label="Local-source states active" value={activeLocal.size.toString()} note="active or partial automated coverage" /><MetricCard label="Production source cells" value={productionAdapters.toString()} note="includes nationwide government business" /><MetricCard label="Source families" value={COVERAGE_FAMILIES.length.toString()} note="normalized output, non-uniform sources" /></div>
    {!national.registryAvailable ? <p className="notice"><strong>Preview registry:</strong> showing the versioned coverage baseline. The additive national registry migration has not been applied to this database.</p> : null}
    <section className="section"><div className="section-header"><div><p className="eyebrow">50 states + DC</p><h2>National coverage matrix</h2><p>Select an active or partial cell to open the official source. Planned means the source and its reuse terms still require verification.</p></div><Link href="/methodology">How evidence is interpreted →</Link></div><div className="coverage-table-wrap national-coverage-wrap"><table className="coverage-table national-coverage-table"><thead><tr><th scope="col">State</th>{COVERAGE_FAMILIES.map((family) => <th scope="col" key={family}>{FAMILY_LABELS[family]}</th>)}</tr></thead><tbody>{STATES.map((state) => <tr key={state}><th scope="row">{state}</th>{COVERAGE_FAMILIES.map((family) => <td key={family}>{cell(matrix.get(`${state}:${family}`))}</td>)}</tr>)}</tbody></table></div></section>
    <section className="section"><div className="section-header"><div><p className="eyebrow">Implemented source detail</p><h2>Cadence, reuse, and limitations</h2><p>An available source is not the same as complete observation of a market.</p></div></div><div className="coverage-table-wrap"><table className="coverage-table"><thead><tr><th scope="col">Evidence family / source</th><th scope="col">Geography</th><th scope="col">Status</th><th scope="col">Reuse</th><th scope="col">Refresh</th><th scope="col">Limitations</th></tr></thead><tbody>{sources.map((row, index) => <tr key={`${row.signal_family}-${row.source_system || row.source_name}-${row.state_code || "all"}-${index}`}><td><strong>{row.signal_family.replaceAll("_", " ")}</strong><span>{row.official_url ? <a href={row.official_url} target="_blank" rel="noreferrer">{row.source_name} ↗</a> : row.source_name}</span></td><td>{[row.country_code, row.state_code, row.county_fips].filter(Boolean).join(" · ")}</td><td><span className={`status-badge status-${row.coverage_status}`}>{row.coverage_status}</span></td><td>{row.reuse_status.replaceAll("_", " ")}</td><td>{row.update_frequency || "Not configured"}</td><td>{row.limitations}</td></tr>)}</tbody></table></div></section>
    <section className="section coverage-principles"><div className="panel"><h2>Coverage interpretation</h2><p>A license can support an opening signal; it does not independently confirm an opening. A permit does not prove the occupant. WARN can indicate site contraction without proving the whole company closed. Government business is commercial context, not physical-location proof.</p></div><div className="panel"><h2>Expansion principle</h2><p>BusinessCurrent normalizes companies, establishments, locations, events, signals, and outcomes while preserving the differences between each official source.</p></div></section>
  </>;
}
