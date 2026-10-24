import type { MetadataRoute } from "next";

import { publicAppUrl, validateRuntimeConfig } from "@/lib/config";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  validateRuntimeConfig();
  const base = publicAppUrl();
  const urls: MetadataRoute.Sitemap = [
    "",
    "/companies",
    "/contracts",
    "/movements",
    "/indicators",
    "/locations",
    "/industries",
    "/agencies",
    "/pricing",
  ].map((path) => ({ url: `${base}${path}`, changeFrequency: "daily" }));

  try {
    const [companies, awards, processes, industries, agencies, locations] =
      await Promise.all([
        query<any>(
          "SELECT slug,updated_at FROM companies WHERE NOT is_benchmark",
        ),
        query<any>(
          "SELECT id::text,updated_at FROM awards WHERE NOT is_benchmark",
        ),
        query<any>(
          "SELECT id::text,updated_at FROM procurement_processes WHERE NOT is_demo",
        ),
        query<any>("SELECT slug FROM industries"),
        query<any>("SELECT slug FROM agencies"),
        query<any>(
          "SELECT DISTINCT lower(performance_state) AS state,performance_county_fips AS county FROM awards WHERE performance_state IS NOT NULL AND performance_county_fips IS NOT NULL AND NOT is_benchmark",
        ),
      ]);

    companies.forEach((row: any) =>
      urls.push({
        url: `${base}/company/${row.slug}`,
        lastModified: row.updated_at,
      }),
    );
    awards.forEach((row: any) =>
      urls.push({
        url: `${base}/contract/${row.id}`,
        lastModified: row.updated_at,
      }),
    );
    processes.forEach((row: any) =>
      urls.push({
        url: `${base}/process/${row.id}`,
        lastModified: row.updated_at,
      }),
    );
    industries.forEach((row: any) =>
      urls.push({ url: `${base}/industry/${row.slug}` }),
    );
    agencies.forEach((row: any) =>
      urls.push({ url: `${base}/agency/${row.slug}` }),
    );
    locations.forEach((row: any) =>
      urls.push({ url: `${base}/location/${row.state}/${row.county}` }),
    );
  } catch {
    // Base sitemap remains available before database setup.
  }

  return urls;
}
