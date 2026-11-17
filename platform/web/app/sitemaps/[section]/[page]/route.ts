import { publicAppUrl } from "@/lib/config";
import { query } from "@/lib/db";

export const revalidate = 86400;

const PAGE_SIZE = 20000;
const PUBLIC_PAGES = [
  "", "/companies", "/contracts", "/predicted-expansion", "/predicted-moves",
  "/predicted-contraction", "/locations", "/business-change", "/movements",
  "/business-formation", "/industries", "/agencies", "/coverage", "/data-coverage",
  "/methodology", "/pricing",
] as const;

type SitemapEntry = { path: string; lastModified?: string | Date | null };
type Params = { section: string; page: string };

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function stamp(date: string | Date | null | undefined) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  return Number.isFinite(d.getTime()) ? `<lastmod>${d.toISOString()}</lastmod>` : "";
}

const SQL: Record<string, string> = {
  companies: `SELECT c.slug,c.updated_at,
    EXISTS(SELECT 1 FROM awards a WHERE a.recipient_company_id=c.id AND NOT a.is_demo AND NOT a.is_benchmark) AS has_contracts
    FROM companies c WHERE NOT c.is_demo AND NOT c.is_benchmark ORDER BY c.slug LIMIT $1 OFFSET $2`,
  contracts: `SELECT id::text AS slug,updated_at FROM awards WHERE NOT is_demo AND NOT is_benchmark ORDER BY id LIMIT $1 OFFSET $2`,
  processes: `SELECT id::text AS slug,updated_at FROM procurement_processes WHERE NOT is_demo ORDER BY id LIMIT $1 OFFSET $2`,
  industries: `SELECT slug FROM industries ORDER BY slug LIMIT $1 OFFSET $2`,
  agencies: `SELECT slug FROM agencies ORDER BY slug LIMIT $1 OFFSET $2`,
  locations: `SELECT DISTINCT lower(performance_state) AS state,performance_county_fips AS county
    FROM awards WHERE performance_state IS NOT NULL AND performance_county_fips IS NOT NULL
    AND NOT is_demo AND NOT is_benchmark ORDER BY state,county LIMIT $1 OFFSET $2`,
};

export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const { section, page: rawPage } = await params;
  const match = /^(0|[1-9]\d*)\.xml$/.exec(rawPage);
  if (!match || (section !== "public" && !(section in SQL))) return new Response("Not found", { status: 404 });
  const page = Number(match[1]);
  if (!Number.isSafeInteger(page) || page > 10000 || (section === "public" && page !== 0)) return new Response("Not found", { status: 404 });

  let entries: SitemapEntry[] = [];
  if (section === "public") entries = PUBLIC_PAGES.map(path => ({ path }));
  else {
    try {
      const rows = await query<any>(SQL[section], [PAGE_SIZE, page * PAGE_SIZE]);
      for (const row of rows) {
        const slug = String(row.slug || "");
        if (section === "companies" && /^[a-zA-Z0-9-]+$/.test(slug)) {
          entries.push({ path: `/company/${slug}`, lastModified: row.updated_at });
          if (row.has_contracts) entries.push({ path: `/company/${slug}/contracts`, lastModified: row.updated_at });
        } else if (section === "locations") {
          const state = String(row.state || "");
          const county = String(row.county || "");
          if (/^[a-z]{2}$/.test(state) && /^\d{3,5}$/.test(county)) entries.push({ path: `/location/${state}/${county}` });
        } else if (/^[a-zA-Z0-9-]+$/.test(slug)) {
          const prefixes: Record<string, string> = { contracts: "contract", processes: "process", industries: "industry", agencies: "agency" };
          const prefix = prefixes[section];
          if (prefix) entries.push({ path: `/${prefix}/${slug}`, lastModified: row.updated_at });
        }
      }
    } catch {
      return new Response("Source index temporarily unavailable", { status: 503 });
    }
    if (entries.length === 0) return new Response("Not found", { status: 404 });
  }

  const base = publicAppUrl().replace(/\/$/, "");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(entry => `<url><loc>${escapeXml(base + entry.path)}</loc>${stamp(entry.lastModified)}</url>`).join("\n")}\n</urlset>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600" } });
}
