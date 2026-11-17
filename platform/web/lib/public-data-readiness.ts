import "server-only";
import { query } from "@/lib/db";

export type PublicDataReadiness = "ready" | "unconfigured" | "unreachable" | "schema_missing" | "empty";
export async function getPublicDataReadiness(): Promise<PublicDataReadiness> {
  if (!process.env.DATABASE_URL) return "unconfigured";
  try {
    const rows = await query<{ companies: string | null; awards: string | null }>(
      "SELECT to_regclass('public.companies')::text AS companies,to_regclass('public.awards')::text AS awards",
    );
    if (!rows[0]?.companies || !rows[0]?.awards) return "schema_missing";
    const evidence = await query<{ any_awards: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM awards WHERE NOT is_demo AND NOT is_benchmark) AS any_awards",
    );
    return evidence[0]?.any_awards ? "ready" : "empty";
  } catch {
    return "unreachable";
  }
}
