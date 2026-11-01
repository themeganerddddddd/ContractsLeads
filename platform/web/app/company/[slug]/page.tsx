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
import { MomentumPanel } from "@/components/MomentumPanel";
import { MovementTable } from "@/components/MovementTable";
import { PredictionPanel } from "@/components/PredictionPanel";
import { RankedList } from "@/components/RankedList";
import { TrackingCoverageMatrix } from "@/components/TrackingCoverageMatrix";
import { WatchCompanyButton } from "@/components/WatchCompanyButton";
import { authEnabled } from "@/lib/config";
import { can } from "@/lib/entitlements";
import { compactMoney, dateLabel, reported } from "@/lib/format";
import { resolvePlan } from "@/lib/plan";
import { getCompanyProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const name = slug.split("-").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
  return { title: name, description: `Locations, business-change evidence, company timeline, and government activity for ${name}.` };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, plan] = await Promise.all([getCompanyProfile(slug), resolvePlan()]);
  if (!data) notFound();

  const { company, metrics } = data;
  const maxAnnual = Math.max(...data.annual.map((row: any) => Math.abs(Number(row.activity))), 1);
  const establishments = data.establishmentIntelligence.establishments;
  const currentEstablishments = establishments.filter((row: any) => !["closed", "inactive", "ceased"].includes(String(row.location_status).toLowerCase()));
  const latestBusinessChange = data.establishmentIntelligence.recentChanges[0];

  return <>
    <section className="entity-heading">
      <div className="breadcrumb"><Link href="/companies">Companies</Link><span>/</span><span>{company.canonical_name}</span></div>
      <div className="entity-header-row">
        <div>
          <p className="eyebrow">Company intelligence profile</p>
          <h1>{company.canonical_name}</h1>
          <p className="entity-subtitle">{reported(company.legal_name)} · {reported(company.industry_name)} · {reported(company.legal_entity_country || company.recipient_country)}</p>
          <div className="entity-meta">
            <span className="meta-chip">Legal entity</span>
            {company.parent_company_name ? <span className="meta-chip">Part of {company.parent_company_name}</span> : null}
            {company.is_demo ? <span className="demo-pill">Demonstration company</span> : null}
          </div>
        </div>
        <div className="entity-actions">
          {data.tracking.target ? <span className={`status-badge status-${data.tracking.target.tracking_status}`}>Platform {data.tracking.target.tracking_status.replaceAll("_", " ")} · {data.tracking.target.priority} priority</span> : <span className="status-badge">Not platform tracked</span>}
          {authEnabled() && can(plan, "company_watches") ? <WatchCompanyButton companyId={company.id} /> : !authEnabled() ? <span className="meta-chip">Personal watchlists coming soon</span> : null}
          <DataNote updated={data.lastUpdated} demo={company.is_demo} source="official procurement and company-intelligence sources" />
        </div>
      </div>
    </section>

    <nav className="tabs company-profile-tabs" aria-label="Company profile sections">
      <a href="#overview">Overview</a>
      <a href="#locations-change">Locations</a>
      <a href="#intelligence-timeline">Timeline</a>
      <a href="#government-business">Government Business</a>
      <a href="#sources">Sources</a>
    </nav>

    <section id="overview">
      <div className="metrics-grid company-metrics">
        <MetricCard label="Locations" value={establishments.length ? currentEstablishments.length.toLocaleString() : "Not available"} note={establishments.length ? `${establishments.length.toLocaleString()} supported establishment records` : "No supported establishment data"} />
        <MetricCard label="Latest change" value={latestBusinessChange ? String(latestBusinessChange.change_type).replaceAll("_", " ") : "Not available"} note={latestBusinessChange ? dateLabel(latestBusinessChange.change_date as string) : "No supported business-change signal"} />
        <MetricCard label="30-day signals" value={Number(data.tracking.target?.signal_count_30d || 0).toLocaleString()} note={data.tracking.target ? `${data.tracking.target.tracking_status} monitoring` : "not tracked"} />
        <MetricCard label="Government business" value={compactMoney(metrics.total_activity)} note={`${Number(metrics.award_count).toLocaleString()} U.S. awards`} />
      </div>
      <dl className="detail-grid">
        <div><dt>Recipient address</dt><dd>{reported([company.recipient_address, company.recipient_city, company.recipient_county, company.recipient_state, company.recipient_zip].filter(Boolean).join(", "))}</dd></div>
        <div><dt>Recipient county FIPS</dt><dd>{reported(company.recipient_county_fips)}</dd></div>
        <div><dt>Reviewed organization</dt><dd>{reported(company.organization_id)}</dd></div>
        <div><dt>Parent company</dt><dd>{reported(company.parent_company_name)}</dd></div>
        <div><dt>Ultimate parent UEI</dt><dd>{reported(company.ultimate_parent_uei)}</dd></div>
        <div><dt>First / last seen</dt><dd>{dateLabel(company.first_seen)} — {dateLabel(company.last_seen)}</dd></div>
      </dl>
    </section>

    <section className="section profile-section-group" id="locations-change">
      <div className="section-header"><div><p className="eyebrow">Company and locations stay distinct</p><h2>Locations</h2><p>Operating locations, address history, confirmed outcomes, and early indications remain separate from recipient and contract-performance addresses.</p></div><Link href={`/business-change?state=${encodeURIComponent(company.recipient_state || "")}`}>Browse market changes →</Link></div>
      <div className="profile-subsection" id="locations"><h3>Operating locations and recent change</h3><EstablishmentIntelligencePanel data={data.establishmentIntelligence} /></div>
      <div className="profile-subsection" id="change-intelligence"><div className="section-header"><div><p className="eyebrow">Evidence summary</p><h3>Business change</h3><p>A score out of 100 measures evidence strength—not event probability. Unsupported states remain visibly unavailable.</p></div></div><ChangeIntelligencePanel data={data.changeIntelligence} /></div>
      <div className="profile-subsection" id="movements"><div className="section-header"><div><p className="eyebrow">Reviewed evidence</p><h3>Moves and market changes</h3><p>Official workforce and economic-development records matched to this legal entity. Name-only matches remain visibly pending review.</p></div><Link href={`/movements?q=${encodeURIComponent(company.canonical_name)}`}>View supporting records →</Link></div><MovementTable rows={data.movements} /></div>
      <div className="profile-subsection" id="early-indicators"><div className="section-header"><div><p className="eyebrow">Early evidence</p><h3>Early indications</h3><p>Descriptive scores require multiple independent evidence types and are never presented as calibrated probabilities.</p></div><Link href="/data-coverage">Review evidence coverage →</Link></div><EarlyIndicatorsPanel data={data.earlyIndicators} /></div>
      <div className="profile-subsection" id="intelligence"><div className="section-header"><div><p className="eyebrow">Gated probabilities</p><h3>Predictions and momentum</h3><p>Probabilities are withheld when the model or entity history does not pass the documented gates.</p></div></div><div className="intelligence-layout"><PredictionPanel predictions={data.predictions} /><MomentumPanel momentum={data.momentum} /></div></div>
    </section>

    <section className="section" id="intelligence-timeline">
      <div className="section-header"><div><p className="eyebrow">One source-backed chronology</p><h2>Timeline</h2><p>Government business, workforce, facility, and corporate evidence appear chronologically. Pending matches remain explicitly pending.</p></div></div>
      <CompanyIntelligenceTimeline rows={data.intelligenceTimeline} />
    </section>

    <section className="section profile-section-group" id="government-business">
      <div className="section-header"><div><p className="eyebrow">Distinct context layer</p><h2>Government Business</h2><p>Contracts, buyers, work locations, and global procurement history are grouped here without being treated as establishment evidence.</p></div></div>
      <div className="profile-subsection"><div className="section-header"><div><h3>Global government activity</h3></div></div><div className="panel"><h3>Countries and activity</h3>{data.globalMetrics.length ? <ul className="plain-list">{data.globalMetrics.map((row: any) => <li key={row.source_country}><strong>{row.source_country}</strong><span>{Number(row.process_count).toLocaleString()} processes · {Number(row.event_count).toLocaleString()} events · latest {dateLabel(row.latest_event)}</span></li>)}</ul> : <p>No global process activity has been linked to this legal entity.</p>}</div></div>
      <div className="profile-subsection" id="contracts"><div className="section-header"><div><h3>U.S. contracts</h3></div></div><AwardTable rows={data.awards.map((award: any) => ({ ...award, canonical_name: company.canonical_name, company_slug: company.slug }))} /></div>
      <div className="profile-subsection split-grid"><div className="panel"><h3>Top agencies</h3><RankedList rows={data.agencies.map((row: any) => ({ ...row, awards: row.award_count, activity: row.activity }))} /></div><div className="panel"><h3>Top work locations</h3><RankedList rows={data.locations.map((row: any) => ({ name: [row.performance_city, row.performance_county, row.performance_state].filter(Boolean).join(", "), awards: row.award_count, activity: row.activity }))} /></div></div>
      <div className="profile-subsection split-grid"><div className="panel"><h3>Industries</h3><RankedList rows={data.industries.map((row: any) => ({ ...row, awards: row.award_count }))} route="industry" /></div><div className="panel" id="history"><h3>Annual net U.S. obligations</h3><div className="annual-net-chart" aria-label="Annual net U.S. obligations, with positive obligations above zero and deobligations below zero">{data.annual.map((row: any) => {
        const value = Number(row.activity);
        const style = { "--bar-size": `${Math.max(4, Math.abs(value) / maxAnnual * 100)}%` } as CSSProperties;
        return <div key={row.year} className={`annual-net-column ${value < 0 ? "negative" : "positive"}`}><strong>{compactMoney(row.activity)}</strong><div className="annual-net-axis" aria-hidden="true"><span style={style} /></div><small>{row.year}</small></div>;
      })}</div></div></div>
    </section>

    <section className="section" id="sources">
      <div className="section-header"><div><p className="eyebrow">No implied nationwide coverage</p><h2>Sources &amp; Coverage</h2><p>Each source reports its supported market, geography, last evaluation state, and retained link.</p></div><Link href="/data-coverage">Platform coverage →</Link></div>
      <TrackingCoverageMatrix rows={data.tracking.coverage} />
      <div className="panel source-identifiers"><h3>Source identifiers</h3>{data.identifiers.length ? <ul className="plain-list">{data.identifiers.map((row: any) => <li key={`${row.identifier_system}-${row.identifier_value}`}><strong>{row.identifier_system}</strong><span>{row.identifier_value}{row.is_verified ? " · verified from source" : ""}{row.source_url ? <> · <a href={row.source_url} target="_blank" rel="noreferrer">source ↗</a></> : null}</span></li>)}</ul> : <p>No source identifiers are available for this legal entity.</p>}</div>
    </section>
  </>;
}
