import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { findArchivedCompany } from "@/lib/offline-snapshot";

import { AwardTable } from "@/components/AwardTable";
import { ContractHistoryChart } from "@/components/ContractHistoryChart";
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
import { CompanyGeographicOutlook } from "@/components/CompanyGeographicOutlook";
import { getCompanySnapshotBySlug, type CompanySnapshotRow } from "@/lib/company-intelligence";
import { can } from "@/lib/entitlements";
import { compactMoney, dateLabel, reported } from "@/lib/format";
import { resolveViewer } from "@/lib/plan";
import { getCompanyProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!process.env.DATABASE_URL) return { title: "Archived company records", robots: { index: false } };
  try {
    const profile = await getCompanyProfile(slug);
    if (!profile) return { title: "Company intelligence", robots: { index: false } };
    const name = profile.company.canonical_name;
    return {
      title: `${name} — Contracts, company history & change signals`,
      description: `Explore ${name}'s federal contract history, disclosed government obligations, operating locations and source-backed company change evidence.`,
      alternates: { canonical: `/company/${profile.company.slug}` },
      robots: { index: !profile.company.is_demo, follow: true },
    };
  } catch {
    return { title: "Company intelligence", robots: { index: false } };
  }
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

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams?: Promise<{ focus?: string | string[] }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const requestedFocus = Array.isArray(query?.focus) ? query?.focus[0] : query?.focus;
  const focus = requestedFocus === "expansion" || requestedFocus === "relocation" || requestedFocus === "contraction" ? requestedFocus : null;
  if (!process.env.DATABASE_URL) {
    if (findArchivedCompany(slug)) redirect(`/public-records/company/${slug}`);
    return <>
      <section className="page-heading"><p className="eyebrow">Company history</p><h1>Archived company records</h1>
        <p>The live company profile is stored in PostgreSQL, which is not configured on this deployment.</p></section>
      <DatabaseNotice />
      <section className="bc-profile-unavailable">
        <span>Company dossier unavailable</span>
        <h2>No unverified profile has been substituted.</h2>
        <p>If this company exists in the database, its identity, locations, signals, and source timeline will return when the connection is restored.</p>
        <div><Link href="/companies">Back to company search</Link><Link href="/public-records">Browse the archived source library</Link></div>
      </section>
    </>;
  }
  const viewer = await resolveViewer();
  const [data, snapshot] = await Promise.all([getCompanyProfile(slug), getCompanySnapshotBySlug(slug, viewer.userId)]);
  if (!data) notFound();

  const { company, metrics } = data;
  const establishments = data.establishmentIntelligence.establishments;
  const currentEstablishments = establishments.filter((row: any) => !["closed", "inactive", "ceased"].includes(String(row.location_status).toLowerCase()));
  const latestBusinessChange = data.establishmentIntelligence.recentChanges[0];
  const latestChange = snapshot?.latest_change_type || latestBusinessChange?.change_type || null;
  const latestChangeDate = snapshot?.latest_change_date || latestBusinessChange?.change_date || null;
  // A missing snapshot location must not hide known, supported establishments.
  const statedLocation = snapshot?.location_label;
  const knownLocation = currentEstablishments.find((row: any) => row.city || row.county || row.state_code);
  const establishmentLocation = knownLocation ? [knownLocation.city, knownLocation.county, knownLocation.state_code].filter(Boolean).join(", ") : "";
  const recipientLocation = [company.recipient_city, company.recipient_state].filter(Boolean).join(", ");
  const geography = statedLocation && !/^(location (not )?available|not (available|reported)|unknown|unavailable)$/i.test(statedLocation.trim())
    ? statedLocation : establishmentLocation || recipientLocation;
  const geographyBasis = geography === establishmentLocation && establishmentLocation
    ? "Supported establishment" : geography === recipientLocation && recipientLocation
      ? "Observed recipient location" : snapshot?.location_basis || "Location not reported";
  const latestMaterial = data.intelligenceTimeline.find((event: any) => event.materiality_status === "material" && event.adjustment_direction);
  const signalKinds = (["expansion", "relocation", "contraction"] as const);
  const relevantKinds = signalKinds.filter(kind => {
    const sufficiency = snapshot?.[`${kind}_sufficiency` as keyof CompanySnapshotRow];
    const score = snapshot?.[`${kind}_score` as keyof CompanySnapshotRow];
    return score != null && sufficiency !== "insufficient_history";
  });
  const visibleKinds = focus ? [focus] as typeof signalKinds[number][] : relevantKinds;

  return <>
    <section className="entity-heading company-profile-heading">
      <div className="breadcrumb"><Link href="/companies">Companies</Link><span>/</span><span>{company.canonical_name}</span></div>
      <div className="entity-header-row"><div><p className="eyebrow">FIRMQUARRY / COMPANY INTELLIGENCE</p><h1>{company.canonical_name}</h1><p className="entity-subtitle">{reported(company.industry_name)} · {geography ? geography + " · " + geographyBasis.toLowerCase() : "Verified headquarters unavailable"}</p>{company.parent_company_name ? <p className="company-parent">Parent: {company.parent_company_name}</p> : null}</div><div className="entity-actions"><Link className="button studio-profile-history-cta" href={`/company/${company.slug}/contracts`}>View contract history ↗</Link>{viewer.user && can(viewer.plan, "company_watches") ? <WatchCompanyButton companyId={company.id} /> : <Link className="button secondary" href="/pricing#pro">Track with Pro</Link>}<DataNote updated={data.lastUpdated} demo={company.is_demo} source="official procurement and company-intelligence sources" /></div></div>
    </section>

    <nav className="tabs company-profile-tabs studio-profile-tabs" aria-label="Company profile sections"><a href="#overview">Overview</a><a href="#geo-outlook">Geographic Outlook</a><a href="#locations-change">Locations</a><a href="#intelligence-timeline">Timeline</a><a href="#government-business">Government Business</a><a href="#sources">Sources</a></nav>

    <section id="overview" className="company-overview">
      <div className="fq-pitchbook-intro">
              <div className="company-facts"><h2>Company facts</h2><dl className="detail-grid"><div><dt>Company industry</dt><dd>{reported(company.industry_name)}</dd></div><div><dt>Legal name</dt><dd>{reported(company.legal_name)}</dd></div><div><dt>Parent company</dt><dd>{reported(company.parent_company_name)}</dd></div><div><dt>Observed geography</dt><dd>{geography ? geography + " · " + geographyBasis : "Not reported"}</dd></div><div><dt>Known operating locations</dt><dd>{establishments.length ? currentEstablishments.length.toLocaleString() : "Not available"}</dd></div><div><dt>First / latest observed</dt><dd>{dateLabel(company.first_seen)} — {dateLabel(company.last_seen)}</dd></div></dl></div>
        <aside className="fq-pitchbook-snapshot" aria-label="Company snapshot">
          <div className="fq-pitchbook-snapshot-heading"><span className="eyebrow">RESEARCH SNAPSHOT</span><h2>At a glance</h2></div>
                <div className="metrics-grid company-metrics"><MetricCard label="Government Business" value={compactMoney(snapshot?.government_business ?? metrics.total_activity)} note="Total disclosed U.S. net obligations" /><MetricCard label="12M Net Obligations" value={signedMoney(snapshot?.obligations_12m ?? metrics.obligations_12m)} note="Previous 365 days, including negatives" /><MetricCard label="Verified Locations" value={establishments.length ? currentEstablishments.length.toLocaleString() : "—"} note="Source-supported establishments only" /><MetricCard label="Latest Change" value={changeLabel(String(latestChange || ""))} note={latestChangeDate ? dateLabel(String(latestChangeDate)) : "No supported change signal"} /></div>
        </aside>
      </div>

      <div className="outlook-section studio-outlook-section"><div className="section-header"><div><p className="eyebrow">{focus ? focus.toUpperCase() + " / FOCUSED RESEARCH" : "SUPPORTED COMPANY SIGNALS"}</p><h2>{focus ? (focus === "relocation" ? "Movement" : focus[0].toUpperCase()+focus.slice(1)) + " outlook" : "Company change signals"}</h2><p>Only supported categories appear in the default dossier. Opening from a specific screener keeps that category in focus. Evidence scores are not probabilities.</p></div></div>
      {visibleKinds.length
        ? <div className="outlook-grid fq-focused-outlook">{visibleKinds.map(kind => <Outlook key={kind} kind={kind} snapshot={snapshot} intelligence={data.changeIntelligence} />)}</div>
        : <p className="fq-no-confirmed-signal">No expansion, contraction or relocation assessment currently meets the evidence threshold for this company.</p>}
      </div>
      <div id="geo-outlook"><CompanyGeographicOutlook company={company.canonical_name} focus={focus} visibleKinds={visibleKinds} expansion={{components:snapshot?.expansion_components,explanation:snapshot?.expansion_explanation,date:snapshot?.expansion_date,score:snapshot?.expansion_score}} relocation={{components:snapshot?.relocation_components,explanation:snapshot?.relocation_explanation,date:snapshot?.relocation_date,score:snapshot?.relocation_score}} contraction={{components:snapshot?.contraction_components,explanation:snapshot?.contraction_explanation,date:snapshot?.contraction_date,score:snapshot?.contraction_score}} /></div>

    </section>

    <section className="section profile-section-group" id="locations-change"><div className="section-header"><div><p className="eyebrow">Company and locations stay distinct</p><h2>Location footprint</h2><p>Only supported operating establishments appear as locations. Procurement work and recipient addresses remain separate evidence.</p></div><Link href={`/locations?state=${encodeURIComponent(company.recipient_state || "")}`}>Browse companies in this geography →</Link></div><div className="profile-subsection"><EstablishmentIntelligencePanel data={data.establishmentIntelligence} /></div><div className="profile-subsection"><ChangeIntelligencePanel data={data.changeIntelligence} focus={focus} /></div><div className="profile-subsection"><div className="section-header"><div><h3>Moves and market changes</h3><p>Reviewed workforce and economic-development records linked to this legal entity.</p></div></div><MovementTable rows={data.movements} /></div><div className="profile-subsection"><EarlyIndicatorsPanel data={data.earlyIndicators} /></div></section>

    <section className="section" id="intelligence-timeline"><div className="section-header"><div><p className="eyebrow">One source-backed chronology</p><h2>Timeline</h2><p>Business change, facilities, workforce, corporate events, and government activity appear chronologically.</p></div></div><CompanyIntelligenceTimeline rows={data.intelligenceTimeline} /></section>

    <section className="section profile-section-group" id="government-business"><div className="section-header"><div><p className="eyebrow">Disclosed procurement context</p><h2>Government Business</h2><p>Money leads this view. Values represent disclosed obligations and procurement amounts—not company revenue.</p></div></div><div className="metrics-grid company-metrics"><MetricCard label="Total Net Obligations" value={compactMoney(metrics.total_activity)} note="U.S. transaction obligations" /><MetricCard label="12M Net Obligations" value={signedMoney(metrics.obligations_12m)} note="Previous 365 days" /><MetricCard label="Latest Award" value={data.awards[0] ? compactMoney(data.awards[0].total_obligated) : "Not reported"} note={data.awards[0] ? dateLabel(data.awards[0].award_date) : "No disclosed award"} /><MetricCard label="Latest Material Adjustment" value={latestMaterial ? nativeMoney(latestMaterial.value, latestMaterial.currency) : "Not reported"} note={latestMaterial ? dateLabel(latestMaterial.event_at) : "No material adjustment linked"} /></div>
      <div className="profile-subsection"><div className="section-header"><div><h3>Global government business</h3><p>Markets and currencies remain separate; incompatible currencies are never summed.</p></div></div>{data.globalMetrics.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Market</th><th>Disclosed value</th><th>Currency</th><th>Latest activity</th><th>Processes</th></tr></thead><tbody>{data.globalMetrics.map((row: any) => <tr key={`${row.source_country}-${row.currency || "none"}`}><td>{row.source_country}</td><td className="numeric"><strong>{nativeMoney(row.disclosed_value, row.currency)}</strong></td><td>{reported(row.currency)}</td><td>{dateLabel(row.latest_activity)}</td><td className="numeric">{Number(row.process_count).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="empty-panel"><p>No global process activity has been linked to this legal entity.</p></div>}</div>
      <div className="profile-subsection split-grid"><div className="panel"><h3>Top agencies by net obligations</h3><RankedList rows={data.agencies.map((row: any) => ({ ...row, awards: row.award_count, activity: row.activity }))} /></div><div className="panel"><h3>Top work locations by net obligations</h3><RankedList rows={data.locations.map((row: any) => ({ name: [row.performance_city, row.performance_county, row.performance_state].filter(Boolean).join(", "), awards: row.award_count, activity: row.activity }))} /></div></div>
      <div className="profile-subsection" id="contracts"><div className="section-header"><div><h3>Latest U.S. awards</h3><p>Explore the most recent records here, or open the full company archive to filter across all available years.</p></div><Link className="studio-inline-action" href={`/company/${company.slug}/contracts`}>Full contract history ↗</Link></div><AwardTable rows={data.awards.map((award: any) => ({ ...award, canonical_name: company.canonical_name, company_slug: company.slug }))} /></div>
      <div className="profile-subsection" id="history"><ContractHistoryChart annual={data.annual} /><div className="studio-history-archive-cta"><p>Historical awards and modifications are preserved as individual records.</p><Link className="studio-outline-link" href={`/company/${company.slug}/contracts`}>Browse all company contracts ↗</Link></div></div>
    </section>

    <section className="section" id="sources"><div className="section-header"><div><p className="eyebrow">Evidence and identifiers</p><h2>Sources &amp; Coverage</h2><p>Technical identifiers live here, with retained official links and visible coverage limitations.</p></div><Link href="/coverage">Platform coverage →</Link></div><TrackingCoverageMatrix rows={data.tracking.coverage} /><div className="panel source-identifiers"><h3>Source identifiers</h3>{data.identifiers.length ? <ul className="plain-list">{data.identifiers.map((row: any) => <li key={`${row.identifier_system}-${row.identifier_value}`}><strong>{row.identifier_system}</strong><span>{row.identifier_value}{row.is_verified ? " · verified from source" : ""}{row.source_url ? <> · <a href={row.source_url} target="_blank" rel="noreferrer">source ↗</a></> : null}</span></li>)}</ul> : <p>No source identifiers are available for this legal entity.</p>}</div></section>
  </>;
}
