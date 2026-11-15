import { publicAppUrl } from "@/lib/config";
import { query } from "@/lib/db";

export const revalidate = 86400;

// Keep comfortably below Google's 50,000-URL-per-sitemap limit.
// Company entries may produce both a company profile and a contract archive.
const RECORDS_PER_SITEMAP = 20000;
const SOURCES = [
  ["companies", "SELECT count(*)::text AS count FROM companies WHERE NOT is_demo AND NOT is_benchmark"],
  ["contracts", "SELECT count(*)::text AS count FROM awards WHERE NOT is_demo AND NOT is_benchmark"],
  ["processes", "SELECT count(*)::text AS count FROM procurement_processes WHERE NOT is_demo"],
  ["industries", "SELECT count(*)::text AS count FROM industries"],
  ["agencies", "SELECT count(*)::text AS count FROM agencies"],
  ["locations", "SELECT count(*)::text AS count FROM (SELECT DISTINCT lower(performance_state),performance_county_fips FROM awards WHERE performance_state IS NOT NULL AND performance_county_fips IS NOT NULL AND NOT is_demo AND NOT is_benchmark) t"],
] as const;

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export async function GET() {
  const base = publicAppUrl().replace(/\/$/, "");
  const urls = [`${base}/sitemaps/public/0.xml`];
  try {
    const counts = await Promise.all(SOURCES.map(async ([section, sql]) => {
      const result = await query<{ count: string }>(sql);
      return { section, count: Number(result[0]?.count || 0) };
    }));
    for (const { section, count } of counts) {
      for (let page = 0; page < Math.ceil(count / RECORDS_PER_SITEMAP); page++) {
        urls.push(`${base}/sitemaps/${section}/${page}.xml`);
      }
    }
  } catch {
    // A temporary database outage should not create an invalid sitemap.
    // The public-page sitemap remains usable.
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `<sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join("\n")}\n</sitemapindex>`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600" } });
}
