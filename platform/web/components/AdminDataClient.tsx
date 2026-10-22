"use client";

import { FormEvent, useState } from "react";

export function AdminDataClient() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  async function load(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/health/data", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) {
      setData(null);
      setError(response.status === 401 ? "Invalid health token." : "Health data is unavailable.");
      return;
    }
    setData(await response.json());
  }
  return <>
    <form className="search-panel" onSubmit={load}><div className="query-row"><label><span>Internal health token</span><input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" /></label><button className="button primary" type="submit">Load statistics</button></div></form>
    {error ? <p role="alert">{error}</p> : null}
    {data ? <>
      <div className="metrics-grid"><div className="metric-card"><span>Status</span><strong>{data.status}</strong></div><div className="metric-card"><span>Database bytes</span><strong>{Number(data.capacity?.database_bytes || 0).toLocaleString()}</strong></div><div className="metric-card"><span>Companies</span><strong>{Number(data.inventory?.companies || 0).toLocaleString()}</strong></div><div className="metric-card"><span>Transactions</span><strong>{Number(data.inventory?.transactions || 0).toLocaleString()}</strong></div></div>
      <section className="section"><h2>Source markets</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Market</th><th>Source</th><th>Processes</th><th>Buyers</th><th>Suppliers</th><th>Coverage</th></tr></thead><tbody>{data.markets?.map((row: any) => <tr key={row.source_market}><td>{row.source_market}</td><td>{row.source_system}</td><td>{row.processes}</td><td>{row.buyers}</td><td>{row.suppliers}</td><td>{row.coverage_start || "—"} — {row.coverage_end || "—"}</td></tr>)}</tbody></table></div></section>
      <section className="section"><h2>Latest source checkpoints</h2><div className="table-wrap"><table className="data-table"><thead><tr><th>Source</th><th>Status</th><th>Seen</th><th>Written</th><th>Updated</th><th>Error</th></tr></thead><tbody>{data.sourceCheckpoints?.map((row: any) => <tr key={row.source_system}><td>{row.source_system}</td><td>{row.status}</td><td>{row.records_seen}</td><td>{row.records_written}</td><td>{row.updated_at}</td><td>{row.error_summary || "—"}</td></tr>)}</tbody></table></div></section>
    </> : null}
  </>;
}
