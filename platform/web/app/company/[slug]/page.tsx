import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AwardTable } from "@/components/AwardTable";
import { CompanyIntelligenceTimeline } from "@/components/CompanyIntelligenceTimeline";
import { DataNote } from "@/components/DataNote";
import { EarlyIndicatorsPanel } from "@/components/EarlyIndicatorsPanel";
import { MetricCard } from "@/components/MetricCard";
import { MovementTable } from "@/components/MovementTable";
import { MomentumPanel } from "@/components/MomentumPanel";
import { PredictionPanel } from "@/components/PredictionPanel";
import { RankedList } from "@/components/RankedList";
import { TrackingCoverageMatrix } from "@/components/TrackingCoverageMatrix";
import { WatchCompanyButton } from "@/components/WatchCompanyButton";
import { can } from "@/lib/entitlements";
import { authEnabled } from "@/lib/config";
import { compactMoney, dateLabel, reported } from "@/lib/format";
import { resolvePlan } from "@/lib/plan";
import { getCompanyProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug.split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" "), description: `Global government contract activity and lifecycle intelligence for ${slug}.` };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, plan] = await Promise.all([getCompanyProfile(slug), resolvePlan()]);
  if (!data) notFound();
  const { company, metrics } = data;
  const verifiedCik = data.identifiers.find((row: any) => row.is_verified && ["CIK", "SEC_CIK"].includes(String(row.identifier_system).toUpperCase()))?.identifier_value;
  const maxAnnual = Math.max(...data.annual.map((row: any) => Number(row.activity)), 1);
  return <>
    <section className="entity-heading">
      <div className="breadcrumb"><Link href="/companies">Companies</Link><span>/</span><span>{company.canonical_name}</span></div>
      <div className="entity-header-row">
        <div><p className="eyebrow">Awarded legal entity</p><h1>{company.canonical_name}</h1><p>{reported(company.legal_name)}</p>
          <div className="entity-meta"><span className="meta-chip">UEI {reported(company.uei)}</span><span className="meta-chip">CAGE {reported(company.cage_code)}</span><span className="meta-chip">CIK {reported(verifiedCik)}</span><span className="meta-chip">Country {reported(company.legal_entity_country || company.recipient_country)}</span><span className="meta-chip">{reported(company.industry_name)}</span>{company.is_demo ? <span className="demo-pill">Demonstration company</span> : null}</div>
        </div>
        <div className="entity-actions">{data.tracking.target ? <span className={`status-badge status-${data.tracking.target.tracking_status}`}>Platform {data.tracking.target.tracking_status.replaceAll("_", " ")} · {data.tracking.target.priority} priority</span> : <span className="status-badge">Not platform tracked</span>}{authEnabled() && can(plan, "company_watches") ? <WatchCompanyButton companyId={company.id} /> : !authEnabled() ? <span className="meta-chip">Personal watchlists coming soon</span> : null}<DataNote updated={data.lastUpdated} demo={company.is_demo} source="official procurement and company-intelligence sources" /></div>
      </div>
    </section>
    <nav className="tabs"><a href="#overview">Overview</a><a href="#intelligence-timeline">Timeline</a><a href="#movements">Movements</a><a href="#early-indicators">Early indicators</a><a href="#coverage">Sources</a><a href="#intelligence">Predictions</a><a href="#global">Global business</a><a href="#contracts">Contracts</a></nav>
    <section id="overview">
      <div className="metrics-grid"><MetricCard label="Government activity" value={compactMoney(metrics.total_activity)} note={`${Number(metrics.award_count).toLocaleString()} U.S. awards`} /><MetricCard label="Latest contract change" value={dateLabel(data.events[0]?.event_at || metrics.latest_award)} note={data.events[0]?.event_type?.replaceAll("_", " ") || "latest award"} /><MetricCard label="Latest movement" value={dateLabel(data.movements[0]?.effective_start_date || data.movements[0]?.announced_date)} note={data.movements[0]?.event_type?.replaceAll("_", " ") || "no linked movement"} /><MetricCard label="Signals last 30d" value={Number(data.tracking.target?.signal_count_30d || 0).toLocaleString()} note={data.tracking.target ? `${data.tracking.target.tracking_status} monitoring` : "not tracked"} /></div>
      <dl className="detail-grid"><div><dt>Recipient address</dt><dd>{reported([company.recipient_address, company.recipient_city, company.recipient_county, company.recipient_state, company.recipient_zip].filter(Boolean).join(", "))}</dd></div><div><dt>Recipient county FIPS</dt><dd>{reported(company.recipient_county_fips)}</dd></div><div><dt>Reviewed organization</dt><dd>{reported(company.organization_id)}</dd></div><div><dt>Parent company</dt><dd>{reported(company.parent_company_name)}</dd></div><div><dt>Ultimate parent UEI</dt><dd>{reported(company.ultimate_parent_uei)}</dd></div><div><dt>First / last seen</dt><dd>{dateLabel(company.first_seen)} — {dateLabel(company.last_seen)}</dd></div></dl>
    </section>
    <section className="section" id="intelligence-timeline"><div className="section-header"><div><p className="eyebrow">One auditable chronology</p><h2>Company Intelligence Timeline</h2><p>Procurement, reviewed movement, facility, and SEC evidence queried from canonical source tables. Pending matches remain explicitly pending.</p></div></div><CompanyIntelligenceTimeline rows={data.intelligenceTimeline} /></section>
    <section className="section" id="movements"><div className="section-header"><div><p className="eyebrow">Company intelligence</p><h2>Source-backed movements</h2><p>Official workforce and economic-development records matched to this legal entity. Name-only matches remain visibly pending review.</p></div><Link href={`/movements?q=${encodeURIComponent(company.canonical_name)}`}>Search all movement records →</Link></div><MovementTable rows={data.movements} /></section>
    <section className="section" id="early-indicators"><div className="section-header"><div><p className="eyebrow">Auditable signals</p><h2>Early indications</h2><p>Descriptive scores require multiple independent evidence types and are never presented as calibrated probabilities.</p></div><Link href="/indicators">Browse covered permits →</Link></div><EarlyIndicatorsPanel data={data.earlyIndicators} /></section>
    <section className="section" id="coverage"><div className="section-header"><div><p className="eyebrow">No implied nationwide coverage</p><h2>Monitoring coverage</h2><p>Each source reports its own supported market, geography, and latest evaluation state.</p></div></div><TrackingCoverageMatrix rows={data.tracking.coverage} /></section>
    <section className="section" id="intelligence"><div className="section-header"><div><p className="eyebrow">Explainable and calibrated</p><h2>Predictive intelligence</h2><p>Probabilities are withheld when the model or entity history does not pass the documented gates.</p></div></div><div className="intelligence-layout"><PredictionPanel predictions={data.predictions} /><MomentumPanel momentum={data.momentum} /></div></section>
    <section className="section" id="global"><div className="section-header"><div><p className="eyebrow">Cross-border record</p><h2>Global government business</h2></div></div>
      <div className="split-grid"><div className="panel"><h2>Countries and activity</h2>{data.globalMetrics.length ? <ul className="plain-list">{data.globalMetrics.map((row: any) => <li key={row.source_country}><strong>{row.source_country}</strong><span>{Number(row.process_count).toLocaleString()} processes · {Number(row.event_count).toLocaleString()} events · latest {dateLabel(row.latest_event)}</span></li>)}</ul> : <p>No global process activity has been linked to this legal entity.</p>}</div><div className="panel"><h2>Source identifiers</h2>{data.identifiers.length ? <ul className="plain-list">{data.identifiers.map((row: any) => <li key={`${row.identifier_system}-${row.identifier_value}`}><strong>{row.identifier_system}</strong><span>{row.identifier_value}{row.is_verified ? " · verified from source" : ""}</span></li>)}</ul> : <p>Only the identifiers shown in the heading are available.</p>}</div></div>
    </section>
    <section className="section" id="contracts"><div className="section-header"><div><p className="eyebrow">Contract register</p><h2>U.S. contracts</h2></div></div><AwardTable rows={data.awards.map((award: any) => ({ ...award, canonical_name: company.canonical_name, company_slug: company.slug }))} /></section>
    <section className="section split-grid"><div className="panel"><h2>Top agencies</h2><RankedList rows={data.agencies.map((row: any) => ({ ...row, awards: row.award_count, activity: row.activity }))} /></div><div className="panel"><h2>Top work locations</h2><RankedList rows={data.locations.map((row: any) => ({ name: [row.performance_city, row.performance_county, row.performance_state].filter(Boolean).join(", "), awards: row.award_count, activity: row.activity }))} /></div></section>
    <section className="section split-grid"><div className="panel"><h2>Industries</h2><RankedList rows={data.industries.map((row: any) => ({ ...row, awards: row.award_count }))} route="industry" /></div><div className="panel" id="history"><h2>Annual U.S. contract activity</h2><div className="chart-list" aria-label="Annual disclosed obligations">{data.annual.map((row: any) => <div key={row.year} className="chart-bar" style={{ height: `${Math.max(3, Number(row.activity) / maxAnnual * 100)}%` }}><strong>{compactMoney(row.activity)}</strong><span>{row.year}</span></div>)}</div></div></section>
  </>;
}
