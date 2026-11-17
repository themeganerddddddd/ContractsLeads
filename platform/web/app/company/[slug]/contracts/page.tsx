import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AwardTable } from "@/components/AwardTable";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { OfficialContractsExplorer } from "@/components/OfficialContractsExplorer";
import { findArchivedCompany } from "@/lib/offline-snapshot";
import { Pagination } from "@/components/Pagination";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
type Params = { slug: string };
type RawSearch = Record<string, string | string[] | undefined>;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!process.env.DATABASE_URL) return { title: "Official federal contract search", robots: { index: false } };
  try {
    const rows = await query<{ canonical_name: string; is_demo: boolean }>(
      "SELECT canonical_name,is_demo FROM companies WHERE slug=$1 AND NOT is_benchmark LIMIT 1", [slug]
    );
    if (!rows.length) return { title: "Company contract history", robots: { index: false } };
    return {
      title: `${rows[0].canonical_name} — Federal contract history`,
      description: `Explore federal contract awards, disclosed obligations, agencies and historical activity for ${rows[0].canonical_name}. Source-linked records and date filters.`,
      alternates: { canonical: `/company/${slug}/contracts` },
      robots: { index: !rows[0].is_demo, follow: true },
    };
  } catch {
    return { title: "Company contract history", robots: { index: false } };
  }
}

export default async function CompanyContractsPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<RawSearch> }) {
  const { slug } = await params;
  if (!process.env.DATABASE_URL) {
    const archived=findArchivedCompany(slug);
    return <>
      <section className="page-heading"><p className="eyebrow">Government contract history</p><h1>Source-linked federal awards</h1>
        <p>The full company contract archive is unavailable while PostgreSQL is offline. The official source search remains available.</p></section>
      <OfficialContractsExplorer searchParams={{recipient:archived?.legalName||slug.replaceAll("-"," ")}}/>
    </>;
  }
  const raw = await searchParams;
  const rawYear = scalar(raw.year);
  const year = rawYear && /^20\d{2}$/.test(rawYear) ? Number(rawYear) : null;
  const agency = scalar(raw.agency)?.trim().slice(0, 100) || null;
  const page = Math.max(1, Math.min(100000, Number.parseInt(scalar(raw.page) || "1", 10) || 1));

  let companyRows: { id: string; slug: string; canonical_name: string; is_demo: boolean }[];
  try {
    companyRows = await query<{ id: string; slug: string; canonical_name: string; is_demo: boolean }>(
      "SELECT id::text,slug,canonical_name,is_demo FROM companies WHERE slug=$1 AND NOT is_benchmark LIMIT 1", [slug]
    );
  } catch (error) {
    return <><section className="page-heading"><p className="studio-section-label">GOVERNMENT CONTRACT HISTORY</p><h1>Historical company awards</h1></section><DatabaseNotice message={error instanceof Error ? error.message : String(error)} /></>;
  }
  const company = companyRows[0];
  if (!company) notFound();

  try {
    const where = `recipient_company_id=$1 AND NOT is_benchmark AND NOT is_demo AND
      ($2::int IS NULL OR EXTRACT(YEAR FROM award_date)::int=$2) AND
      ($3::text IS NULL OR awarding_agency ILIKE '%' || $3 || '%')`;
    const [counts, years, awards] = await Promise.all([
      query<{ total: string }>(`SELECT count(*)::text AS total FROM awards WHERE ${where}`, [company.id, year, agency]),
      query<{ year: number }>(`SELECT DISTINCT EXTRACT(YEAR FROM award_date)::int AS year FROM awards WHERE recipient_company_id=$1 AND award_date IS NOT NULL AND NOT is_demo AND NOT is_benchmark ORDER BY year DESC`, [company.id]),
      query<any>(`SELECT id::text,title,description,award_date::text,total_obligated::text,current_value::text,potential_value::text,
        awarding_agency,performance_city,performance_state,is_demo
        FROM awards WHERE ${where}
        ORDER BY award_date DESC NULLS LAST,id DESC LIMIT $4 OFFSET $5`,
        [company.id, year, agency, PAGE_SIZE, (page - 1) * PAGE_SIZE]),
    ]);
    const total = Number(counts[0]?.total || 0);
    return <>
      <section className="studio-archive-hero">
        <div className="breadcrumb"><Link href="/companies">Companies</Link><span>/</span><Link href={`/company/${company.slug}`}>{company.canonical_name}</Link><span>/</span><span>Contracts</span></div>
        <p className="studio-section-label">COMPANY / HISTORICAL GOVERNMENT BUSINESS</p>
        <h1>{company.canonical_name}</h1>
        <h2>Federal contract history</h2>
        <p>Explore recorded U.S. federal awards and reported obligations. Award amounts and modifications are not interchangeable with company revenue.</p>
        <Link href={`/company/${company.slug}#government-business`} className="studio-archive-back">← Company intelligence profile</Link>
      </section>
      <form action={`/company/${company.slug}/contracts`} method="get" className="studio-archive-filter">
        <label>Award calendar year
          <select name="year" defaultValue={year || ""}><option value="">All available years</option>{years.map(row => <option value={row.year} key={row.year}>{row.year}</option>)}</select>
        </label>
        <label>Agency name
          <input name="agency" defaultValue={agency || ""} placeholder="e.g. Department of Defense" />
        </label>
        <button className="button primary" type="submit">Apply filters</button>
        <Link className="button secondary" href={`/company/${company.slug}/contracts`}>Clear</Link>
      </form>
      <div className="results-toolbar studio-archive-results"><div><h2>{total.toLocaleString()} matching awards</h2><p>Page {page.toLocaleString()} · Officially reported source records</p></div><Link href="/methodology">How we calculate values ↗</Link></div>
      <AwardTable rows={awards.map(row => ({ ...row,canonical_name:company.canonical_name,company_slug:company.slug }))} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={raw} />
      <p className="studio-archive-note">Dates are award dates, not necessarily the dates when funds were obligated. Click any award to review its transaction history and source links.</p>
    </>;
  } catch (error) {
    return <><section className="page-heading"><p className="studio-section-label">GOVERNMENT CONTRACT HISTORY</p><h1>Historical company awards</h1></section><DatabaseNotice message={error instanceof Error ? error.message : String(error)} /></>;
  }
}
