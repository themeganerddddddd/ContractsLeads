import "server-only";

import { query } from "@/lib/db";

export const COVERAGE_FAMILIES = [
  "registrations", "licenses", "permits", "occupancy", "warn", "economic_development", "government_business",
] as const;

export type CoverageFamily = typeof COVERAGE_FAMILIES[number];
export type NationalCoverageRow = {
  state_code: string;
  source_family: CoverageFamily;
  coverage_status: "available" | "partial" | "blocked" | "manual" | "unsupported" | "planned" | "active";
  source_name: string | null;
  source_url: string | null;
  reuse_status: string;
  automation_status: string;
  refresh_frequency: string | null;
  last_successful_collection: string | null;
  known_limitations: string;
};

export const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND",
  "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
] as const;

function baseline(): NationalCoverageRow[] {
  const rows = STATES.flatMap((state_code) => COVERAGE_FAMILIES.map((source_family) => ({
    state_code,
    source_family,
    coverage_status: source_family === "government_business" ? "active" as const : "planned" as const,
    source_name: source_family === "government_business" ? "USAspending" : null,
    source_url: source_family === "government_business" ? "https://api.usaspending.gov/" : null,
    reuse_status: source_family === "government_business" ? "permitted" : "unverified",
    automation_status: source_family === "government_business" ? "production" : "planned",
    refresh_frequency: source_family === "government_business" ? "routine ingestion" : null,
    last_successful_collection: null,
    known_limitations: source_family === "government_business"
      ? "Nationwide federal procurement coverage; recipient and performance locations are not verified establishments."
      : "Official source, reuse terms, and automation have not yet been verified for this state and family.",
  })));
  const replace = (state: string, family: CoverageFamily, values: Partial<NationalCoverageRow>) => {
    const row = rows.find((item) => item.state_code === state && item.source_family === family);
    if (row) Object.assign(row, values);
  };
  replace("MD", "warn", { coverage_status: "active", source_name: "Maryland WARN / ESA / Other Dislocations Log", source_url: "https://www.labor.maryland.gov/employment/warn.shtml", automation_status: "production", refresh_frequency: "as published", known_limitations: "State workforce reductions only; inclusion does not independently prove a company-wide closure." });
  replace("VA", "warn", { coverage_status: "active", source_name: "Virginia Works WARN Notices", source_url: "https://virginiaworks.gov/im-an-employer/retain-and-grow/warn-notices/", automation_status: "production", refresh_frequency: "as published", known_limitations: "State workforce reductions only; published company addresses are not promoted to affected worksites or headquarters." });
  replace("MD", "economic_development", { coverage_status: "active", source_name: "Maryland Department of Commerce Press Room", source_url: "https://commerce.maryland.gov/press-room", automation_status: "production", refresh_frequency: "as published", known_limitations: "Official announcements only; announced jobs and investments are not completed outcomes." });
  replace("MD", "permits", { coverage_status: "partial", source_name: "Montgomery County Commercial Permits", source_url: "https://data.montgomerycountymd.gov/d/i26v-w6bd", reuse_status: "permitted", automation_status: "production", refresh_frequency: "daily", known_limitations: "Coverage is limited to Montgomery County; permit records do not independently prove the occupant." });
  replace("DC", "licenses", { coverage_status: "partial", source_name: "DC Basic Business Licenses", source_url: "https://opendata.dc.gov/", reuse_status: "permitted", automation_status: "production", refresh_frequency: "source dependent", known_limitations: "License coverage is not a complete registry of every operating establishment." });
  return rows;
}

export async function getNationalCoverage(): Promise<{ rows: NationalCoverageRow[]; registryAvailable: boolean }> {
  const fallback = baseline();
  try {
    const stored = await query<NationalCoverageRow>(
      `SELECT state_code,source_family,coverage_status,source_name,source_url,reuse_status,automation_status,
       refresh_frequency,last_successful_collection::text,known_limitations
       FROM national_source_coverage ORDER BY state_code,source_family`,
    );
    return { rows: stored.length ? stored : fallback, registryAvailable: true };
  } catch {
    return { rows: fallback, registryAvailable: false };
  }
}
