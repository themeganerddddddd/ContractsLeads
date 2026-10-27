import { DatabaseNotice } from "@/components/DatabaseNotice";
import { getBusinessChangeCoverage } from "@/lib/business-change";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business-change data coverage", description: "Geographic, reuse, refresh, and limitation disclosures for every business-change source family." };

export default async function DataCoveragePage() {
  try {
    const rows = await getBusinessChangeCoverage();
    return <>
      <section className="page-heading"><p className="eyebrow">Transparent by source and geography</p><h1>Business-change data coverage</h1><p>Available means the adapter and permitted source exist; partial means coverage is geographically or substantively limited. Unsupported and planned sources never imply observation.</p></section>
      <div className="coverage-table-wrap"><table className="coverage-table"><thead><tr><th>Signal family / source</th><th>Geography</th><th>Status</th><th>Reuse</th><th>Refresh</th><th>Limitations</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.signal_family}-${row.source_system || row.source_name}-${row.state_code || "all"}-${index}`}><td><strong>{row.signal_family.replaceAll("_", " ")}</strong><span>{row.official_url ? <a href={row.official_url} target="_blank" rel="noreferrer">{row.source_name} ↗</a> : row.source_name}</span></td><td>{[row.country_code, row.state_code, row.county_fips].filter(Boolean).join(" · ")}</td><td><span className={`status-badge status-${row.coverage_status}`}>{row.coverage_status}</span></td><td>{row.reuse_status.replaceAll("_", " ")}</td><td>{row.update_frequency || "Not configured"}</td><td>{row.limitations}</td></tr>)}</tbody></table></div>
      <section className="section"><div className="panel"><h2>Interpretation rule</h2><p>A source-backed record is not the same as complete market coverage. Procurement is government-business evidence; a license is an opening signal; a permit does not prove an occupant; WARN can indicate site contraction without proving the whole company closed.</p></div></section>
    </>;
  } catch (cause) {
    return <><section className="page-heading"><p className="eyebrow">Transparent by source and geography</p><h1>Business-change data coverage</h1></section><DatabaseNotice message={cause instanceof Error ? cause.message : String(cause)} /></>;
  }
}
