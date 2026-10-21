import "server-only";
import { query } from "@/lib/db";
import { deriveHealthStatus, type HealthRun } from "@/lib/health-model";

export async function getIngestionHealth() {
  const [runs, jobs, inventory] = await Promise.all([
    query<HealthRun>(
      `SELECT source,status,completed_at::text,records_received::text,records_failed::text,duration_ms::text,error_summary
       FROM ingestion_runs WHERE status IN ('success','partial','failed')
       ORDER BY completed_at DESC NULLS LAST LIMIT 60`
    ),
    query<{
      id: string; status: string; start_date: string; end_date: string; source_file_name: string;
      rows_processed: string; rows_in_window: string; records_failed: string; updated_at: string; error_summary: string | null;
    }>(
      `SELECT id::text,status,start_date::text,end_date::text,source_file_name,rows_processed::text,rows_in_window::text,
       records_failed::text,updated_at::text,error_summary FROM backfill_jobs ORDER BY updated_at DESC LIMIT 20`
    ),
    query<{ companies: string; awards: string; transactions: string; latest_action_date: string | null }>(
      `SELECT (SELECT count(*) FROM companies WHERE NOT is_demo AND NOT is_benchmark)::text AS companies,
       (SELECT count(*) FROM awards WHERE NOT is_demo AND NOT is_benchmark)::text AS awards,
       (SELECT count(*) FROM transactions WHERE NOT is_demo AND NOT is_benchmark)::text AS transactions,
       (SELECT max(action_date)::text FROM transactions WHERE NOT is_demo AND NOT is_benchmark) AS latest_action_date`
    )
  ]);
  const derived = deriveHealthStatus(runs);
  return {
    ...derived,
    checkedAt: new Date().toISOString(),
    inventory: inventory[0],
    runs,
    backfills: jobs
  };
}
