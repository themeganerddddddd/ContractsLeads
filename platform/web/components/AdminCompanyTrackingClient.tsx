"use client";

import { FormEvent, useState } from "react";

type Snapshot = { companies: any[]; targets: any[]; discoveries: any[]; reviews: any[] };

export function AdminCompanyTrackingClient() {
  const [token, setToken] = useState("");
  const [actor, setActor] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("");

  async function load(event?: FormEvent) {
    event?.preventDefault();
    setMessage("");
    const response = await fetch(`/api/admin/company-tracking?q=${encodeURIComponent(search)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!response.ok) {
      setData(null);
      setMessage(response.status === 401 ? "Invalid internal token." : "Analyst data is unavailable.");
      return;
    }
    setData(await response.json());
  }

  async function mutate(url: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
    if (!actor.trim()) {
      setMessage("Enter an analyst name before making an auditable change.");
      return;
    }
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, actor: actor.trim() }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Change saved and audit history recorded." : result.error || "Change failed.");
    if (response.ok) await load();
  }

  return <>
    <form className="search-panel" onSubmit={load}>
      <div className="advanced-grid admin-tracking-controls">
        <label>Internal token<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" /></label>
        <label>Analyst name<input value={actor} onChange={(event) => setActor(event.target.value)} maxLength={120} /></label>
        <label>Company / identifier<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Legal name, UEI, or CAGE" /></label>
        <button className="button primary" type="submit">Load review workspace</button>
      </div>
    </form>
    <p aria-live="polite">{message}</p>
    {data ? <>
      <section className="section"><div className="section-header"><div><p className="eyebrow">Exact entity selection</p><h2>Company search</h2><p>Tracking always uses the selected canonical company ID; free text is never stored as a target.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Company</th><th>Identifiers</th><th>Recipient geography</th><th>Reviewed parent</th><th>Tracking</th></tr></thead><tbody>{data.companies.map((company) => <tr key={company.id}><td><strong>{company.canonical_name}</strong><small>{company.legal_name}</small></td><td>UEI {company.uei || "—"}<small>CAGE {company.cage_code || "—"} · CIK {company.cik || "—"}</small></td><td>{[company.recipient_city, company.recipient_state].filter(Boolean).join(", ") || "Not reported"}</td><td>{company.parent_company_name || "Not reviewed"}</td><td>{company.tracking_status ? <><span className="status-badge status-active">{company.tracking_status}</span><small>{company.priority} priority</small></> : <button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-tracking", "POST", { companyId: company.id, reason: "analyst_review", priority: "normal" })}>Track company</button>}</td></tr>)}</tbody></table></div>
      </section>
      <section className="section"><div className="section-header"><div><p className="eyebrow">Platform registry</p><h2>Monitor targets</h2></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Company</th><th>Status</th><th>Priority</th><th>Source families</th><th>Lifecycle</th></tr></thead><tbody>{data.targets.map((target) => <tr key={target.id}><td><strong>{target.canonical_name}</strong><small>UEI {target.uei || "—"} · CAGE {target.cage_code || "—"}</small></td><td>{target.tracking_status}</td><td><div className="inline-actions"><button className="button secondary" type="button" aria-pressed={target.priority === "high"} onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, priority: "high" })}>High</button><button className="button secondary" type="button" aria-pressed={target.priority === "normal"} onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, priority: "normal" })}>Normal</button><button className="button secondary" type="button" aria-pressed={target.priority === "low"} onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, priority: "low" })}>Low</button></div></td><td><div className="inline-actions"><button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, monitorProcurement: !target.monitor_procurement })}>Procurement {target.monitor_procurement ? "on" : "off"}</button><button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, monitorMovements: !target.monitor_movements })}>Movement {target.monitor_movements ? "on" : "off"}</button><button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, monitorPermits: !target.monitor_permits })}>Permits {target.monitor_permits ? "on" : "off"}</button><button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, monitorSec: !target.monitor_sec })}>SEC {target.monitor_sec ? "on" : "off"}</button></div></td><td><div className="inline-actions"><button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, status: "active" })}>Activate</button><button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, status: "paused" })}>Pause</button><button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-tracking", "PATCH", { companyId: target.company_id, status: "archived" })}>Archive</button></div></td></tr>)}</tbody></table></div>
      </section>
      <section className="section"><div className="section-header"><div><p className="eyebrow">Discovery triage</p><h2>Discovered companies</h2><p>Promote only an exact linked legal entity. Unresolved names remain in match review.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Observed / linked entity</th><th>Reason</th><th>Match</th><th>Evidence</th><th>Actions</th></tr></thead><tbody>{data.discoveries.map((discovery) => <tr key={discovery.id}><td><strong>{discovery.canonical_name || discovery.observed_company_name}</strong><small>{discovery.legal_name || "No authoritative legal entity linked"}{discovery.company_id ? ` · UEI ${discovery.uei || "—"} · CAGE ${discovery.cage_code || "—"}` : ""}</small></td><td>{discovery.discovery_reason.replaceAll("_", " ")}<small>{discovery.source_system} · {discovery.event_date || "date not reported"}</small></td><td>{discovery.match_status.replaceAll("_", " ")}<small>{discovery.discovery_status.replaceAll("_", " ")}</small></td><td><a href={discovery.source_url} target="_blank" rel="noreferrer">Official source ↗</a></td><td><div className="inline-actions">{discovery.company_id && !discovery.tracking_status ? <button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-tracking", "POST", { companyId: discovery.company_id, reason: "analyst_review", priority: "normal" })}>Track exact entity</button> : null}{discovery.slug ? <a className="button secondary" href={`/company/${discovery.slug}`}>Open profile</a> : <span>Resolve entity below</span>}<button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-discoveries", "PATCH", { discoveryId: discovery.id, status: "under_review" })}>Review</button><button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-discoveries", "PATCH", { discoveryId: discovery.id, status: "dismissed" })}>Dismiss</button></div></td></tr>)}</tbody></table></div>
      </section>
      <section className="section"><div className="section-header"><div><p className="eyebrow">Conservative entity resolution</p><h2>Company match reviews</h2><p>Approval records an analyst-reviewed relationship; it does not relabel the link as identifier-verified.</p></div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Observed source company</th><th>Candidate legal entity</th><th>Method</th><th>Evidence</th><th>Decision</th></tr></thead><tbody>{data.reviews.map((review) => <tr key={review.id}><td><strong>{review.observed_company_name}</strong><small>{review.event_type.replaceAll("_", " ")} · {review.event_title}</small></td><td>{review.canonical_name ? <><strong>{review.canonical_name}</strong><small>{review.legal_name} · UEI {review.uei || "—"} · CAGE {review.cage_code || "—"} · CIK {review.cik || "—"}</small></> : "No candidate selected"}</td><td>{review.match_status}<small>{review.matching_method || "No method"} · confidence {review.confidence || "—"}</small></td><td><a href={review.original_url} target="_blank" rel="noreferrer">Official source ↗</a></td><td><div className="inline-actions">{review.candidate_company_id ? <button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-match-reviews", "PATCH", { reviewId: review.id, decision: "approved" })}>Approve</button> : null}<button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-match-reviews", "PATCH", { reviewId: review.id, decision: "rejected" })}>Reject</button><button className="button secondary" type="button" onClick={() => mutate("/api/admin/company-match-reviews", "PATCH", { reviewId: review.id, decision: "pending" })}>Leave unresolved</button></div></td></tr>)}</tbody></table></div>
      </section>
    </> : null}
  </>;
}
