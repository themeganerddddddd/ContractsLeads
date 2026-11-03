import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { AwardTable } from "@/components/AwardTable";
import { ChangeIntelligencePanel } from "@/components/ChangeIntelligencePanel";
import { CompanyIntelligenceTimeline } from "@/components/CompanyIntelligenceTimeline";
import { DataNote } from "@/components/DataNote";
import { EarlyIndicatorsPanel } from "@/components/EarlyIndicatorsPanel";
import { EstablishmentIntelligencePanel } from "@/components/EstablishmentIntelligencePanel";
import { MetricCard } from "@/components/MetricCard";
import { MovementTable } from "@/components/MovementTable";
import { RankedList } from "@/components/RankedList";
import { TrackingCoverageMatrix } from "@/components/TrackingCoverageMatrix";
import { WatchCompanyButton } from "@/components/WatchCompanyButton";
import { getCompanySnapshotBySlug, type CompanySnapshotRow } from "@/lib/company-intelligence";
import { can } from "@/lib/entitlements";
import { compactMoney, dateLabel, reported } from "@/lib/format";
import { resolveViewer } from "@/lib/plan";
import { getCompanyProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
  return { title: name, description: `Company, location, business-change, and disclosed government activity intelligence for ${name}.` };
}

function signedMoney(value: string | null | undefined) {
  if (value == null) return "Not reported";
  return Number(value) > 0 ? `+${compactMoney(value)}` : compactMoney(value);
}

function nativeMoney(value: string | null | undefined, currency: string | null | undefined) {
  if (value == null) return "Not disclosed";
  if (!currency) return Number(value).toLocaleString();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toLocaleString()}`;
  }
}

function changeLabel(value: string | null | undefined) {
  const labels: Record<string, string> = { expansion: "Expansion", growth: "Growing", relocation: "Move", contraction: "Contraction", closure_distress: "Closure risk" };
  return value ? labels[value] || value.replaceAll("_", " ") : "No recent change";
}

function signalBand(score: unknown, sufficiency: unknown) {
  if (score == null || sufficiency === "insufficient_history") return "Insufficient evidence";
  const value = Number(score);
  return value >= 70 ? "Strong signal" : value >= 40 ? "Moderate signal" : "Limited signal";
}

function Outlook({ kind, snapshot, intelligence }: { kind: "expansion" | "relocation" | "contraction"; snapshot: CompanySnapshotRow | null; intelligence: any }) {
  const predictionType = `company_${kind}`;
  const prediction = intelligence.predictions.find((row: any) => row.prediction_type === predictionType);
  const calibrated = prediction?.probability_eligible === true && prediction?.model_status === "active" && prediction?.data_sufficiency === "sufficient" && prediction?.probability != null;
  const prefix = kind === "relocation" ? "relocation" : kind;
  const score = snapshot?.[`${prefix}_score` as keyof CompanySnapshotRow];
  const sufficiency = snapshot?.[`${prefix}_sufficiency` as keyof CompanySnapshotRow];
  const date = snapshot?.[`${prefix}_date` as keyof CompanySnapshotRow];
  const title = kind === "relocation" ? "Move" : kind[0].toUpperCase() + kind.slice(1);
  return <article className="outlook-card"><span>{title}</span><strong>{calibrated ? `${Math.round(Number(prediction.probability) * 100)}% predicted probability` : signalBand(score, sufficiency)}</strong><small>{calibrated ? `${prediction.horizon_days}-day validated model · ${dateLabel(prediction.as_of_date)}` : score == null ? "No recent supported signal" : `Prediction not yet available · evidence as of ${dateLabel(String(date))}`}</small></article>;
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await resolveViewer();
  const [data, snapshot] = await Promise.all([getCompanyProfile(slug), getCompanySnapshotBySlug(slug, viewer.userId)]);
  if (!data) notFound();

  const { company, metrics } = data;
  const maxAnnual = Math.max(...data.annual.map((row: any) => Math.abs(Number(row.activity))), 1);
  const establishments = data.establishmentIntelligence.establishments;
  const currentEstablishments = establishments.filter((row: any) => !["closed", "inactive", "ceased"].includes(String(row.location_status).toLowerCase()));
  const latestBusinessChange = data.establishmentIntelligence.recentChanges[0];
  const latestChange = snapshot?.latest_change_type || latestBusinessChange?.change_type || null;
  const latestChangeDate = snapshot?.latest_change_date || latestBusinessChange?.change_date || null;
  const geography = snapshot?.location_label || [company.recipient_city, company.recipient_state].filter(Boolean).join(", ");
  const geographyBasis = snapshot?.location_basis || (geography ? "Observed recipient location" : "Location not reported");
  const latestMaterial = data.intelligenceTimeline.find((event: any) => event.materiality_status === "material" && event.adjustment_direction);

  return <>
    <section className="entity-heading company-profile-heading">
      <div className="breadcrumb"><Link href="/companies">Companies</Link><span>/</span><span>{company.canonical_name}</span></div>
      <div className="entity-header-row"><div><p className="eyebrow">Company intelligence profile</p><h1>{company.canonical_name}</h1><p className="entity-subtitle">{reported(company.industry_name)} · {reported(geography)} · {geographyBasis.toLowerCase()}</p>{company.parent_company_name ? <p className="company-parent">Parent: {company.parent_company_name}</p> : null}</div><div className="entity-actions">{viewer.user && can(viewer.plan, "company_watches") ? <WatchCompanyButton companyId={company.id} /> : <Link className="button secondary" href="/pricing#pro">Track with Pro</Link>}<DataNote updated={data.lastUpdated} demo={company.is_demo} source="official procurement and company-intelligence sources" /></div></div>
    </section>

    <nav className="tabs company-profile-tabs" aria-label="Company profile sections"><a href="#overview">Overview</a><a href="#locations-change">Locations</a><a href="#intelligence-timeline">Timeline</a><a href="#government-business">Government Business</a><a href="#sources">Sources</a></nav>

    <section id="overview" className="company-overview">
      <div className="metrics-grid company-metrics"><MetricCard label="Government Business" value={compactMoney(snapshot?.government_business ?? metrics.total_activity)} note="Total disclosed U.S. net obligations" /><MetricCard label="12M Net Obligations" value={signedMoney(snapshot?.obligations_12m ?? metrics.obligations_12m)} note="Previous 365 days, including negatives" /><MetricCard label="Locations" value={establishments.length ? currentEstablishments.length.toLocaleString() : "Not available"} note="Supported operating locations" /><MetricCard label="Latest Change" value={changeLabel(String(latestChange || ""))} note={latestChangeDate ? dateLabel(String(latestChangeDate)) : "No supported change signal"} /></div>
      <div className="outlook-section"><div className="section-header"><div><p className="eyebrow">Evidence-aware intelligence</p><h2>Outlook</h2><p>Probabilities appear only for calibrated, active models with sufficient data. All other labels describe evidence strength.</p></div></div><div className="outlook-grid"><Outlook kind="expansion" snapshot={snapshot} intelligence={data.changeIntelligence} /><Outlook kind="relocation" snapshot={snapshot} intelligence={data.changeIntelligence} /><Outlook kind="contraction" snapshot={snapshot} intelligence={data.changeIntelligence} /></div></div>
      <div className="company-facts"><h2>Company facts</h2><dl className="detail-grid"><div><dt>Company industry</dt><dd>{reported(company.industry_name)}</dd></div><div><dt>Legal name</dt><dd>{reported(company.legal_name)}</dd></div><div><dt>Parent company</dt><dd>{reported(company.parent_company_name)}</dd></div><div><dt>Observed geography</dt><dd>{reported(geography)} · {geographyBasis}</dd></div><div><dt>Known operating locations</dt><dd>{establishments.length ? currentEstablishments.length.toLocaleString() : "Not available"}</dd></div><div><dt>First / latest observed</dt><dd>{dateLabel(company.first_seen)} — {dateLabel(company.last_seen)}</dd></div></dl></div>
    </section>

    <section className="section profile-section-group" id="locations-change"><div className="section-header"><div><p className="eyebrow">Company and locations stay distinct</p><h2>Location footprint</h2><p>Only supported operating establishments appear as locations. Procurement work and recipient addresses remain separate evidence.</p></div><Link href={`/locations?state=${encodeURIComponent(company.recipient_state || "")}`}>Browse companies in this geography →</Link></div><div className="profile-subsection"><EstablishmentIntelligencePanel data={data.establishmentIntelligence} /></div><div className="profile-subsection"><ChangeIntelligencePanel data={data.changeIntelligence} /></div><div className="profile-subsection"><div className="section-header"><div><h3>Moves and market changes</h3><p>Reviewed workforce and economic-development records linked to this legal entity.</p></div></div><MovementTable rows={data.movements} /></div><div className="profile-subsection"><EarlyIndicatorsPanel data={data.earlyIndicators} /></div></section>

    <section className="section" id="intelligence-timeline"><div className="section-header"><div><p className="eyebrow">One source-backed chronology</p><h2>Timeline</h2><p>Business change, facilities, workforce, corporate events, and government activity appear chronologically.</p></div></div><CompanyIntelligenceTimeline rows={data.intelligenceTimeline} /></section>

    <section className="section profile-section-group" id="government-business"><div className="section-header"><div><p className="eyebrow">Disclosed procurement context</p><h2>Government Business</h2><p>Money leads this view. Values represent disclosed obligations and procurement amounts—not company revenue.</p></div></div><div className="metrics-grid company-metrics"><MetricCard label="Total Net Obligations" value={compactMoney(metrics.total_activity)} note="U.S. transaction obligations" /><MetricCard label="12M Net Obligations" value={signedMoney(metrics.obligations_12m)} note="Previous 365 days" /><MetricCard label="Latest Award" value={data.awards[0] ? compactMoney(data.awards[0].total_obligated) : "Not reported"} note={data.awards[0] ? dateLabel(data.awards[0].award_date) : "No disclosed award"} /><MetricCard label="Latest Material Adjustment" value={latestMaterial ? nativeMoney(latestMaterial.value, latestMaterial.currency) : "Not reported"} note={latestMaterial ? dateLabel(latestMaterial.event_at) : "No material adjustment linked"} /></div>
      <div className="profile-subsection"><div className="section-header"><div><h3>Global government business</h3><p>Markets and currencies remain separate; incompatible currencies are never summed.</p></div></div>{data.globalMetrics.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Market</th><th>Disclosed value</th><th>Currency</th><th>Latest activity</th><th>Processes</th></tr></thead><tbody>{data.globalMetrics.map((row: any) => <tr key={`${row.source_country}-${row.currency || "none"}`}><td>{row.source_country}</td><td className="numeric"><strong>{nativeMoney(row.disclosed_value, row.currency)}</strong></td><td>{reported(row.currency)}</td><td>{dateLabel(row.latest_activity)}</td><td className="numeric">{Number(row.process_count).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="empty-panel"><p>No global process activity has been linked to this legal entity.</p></div>}</div>
      <div className="profile-subsection split-grid"><div className="panel"><h3>Top agencies by net obligations</h3><RankedList rows={data.agencies.map((row: any) => ({ ...row, awards: row.award_count, activity: row.activity }))} /></div><div className="panel"><h3>Top work locations by net obligations</h3><RankedList rows={data.locations.map((row: any) => ({ name: [row.performance_city, row.performance_county, row.performance_state].filter(Boolean).join(", "), awards: row.award_count, activity: row.activity }))} /></div></div>
      <div className="profile-subsection" id="contracts"><div className="section-header"><div><h3>Latest U.S. awards</h3></div></div><AwardTable rows={data.awards.map((award: any) => ({ ...award, canonical_name: company.canonical_name, company_slug: company.slug }))} /></div>
      <div className="profile-subsection panel" id="history"><h3>Annual net U.S. obligations</h3><div className="annual-net-chart" aria-label="Annual net U.S. obligations, with positive obligations above zero and deobligations below zero">{data.annual.map((row: any) => { const value = Number(row.activity); const style = { "--bar-size": `${Math.max(4, Math.abs(value) / maxAnnual * 100)}%` } as CSSProperties; return <div key={row.year} className={`annual-net-column ${value < 0 ? "negative" : "positive"}`}><strong>{compactMoney(row.activity)}</strong><div className="annual-net-axis" aria-hidden="true"><span style={style} /></div><small>{row.year}</small></div>; })}</div></div>
    </section>

    <section className="section" id="sources"><div className="section-header"><div><p className="eyebrow">Evidence and identifiers</p><h2>Sources &amp; Coverage</h2><p>Technical identifiers live here, with retained official links and visible coverage limitations.</p></div><Link href="/coverage">Platform coverage →</Link></div><TrackingCoverageMatrix rows={data.tracking.coverage} /><div className="panel source-identifiers"><h3>Source identifiers</h3>{data.identifiers.length ? <ul className="plain-list">{data.identifiers.map((row: any) => <li key={`${row.identifier_system}-${row.identifier_value}`}><strong>{row.identifier_system}</strong><span>{row.identifier_value}{row.is_verified ? " · verified from source" : ""}{row.source_url ? <> · <a href={row.source_url} target="_blank" rel="noreferrer">source ↗</a></> : null}</span></li>)}</ul> : <p>No source identifiers are available for this legal entity.</p>}</div></section>
  </>;
}
