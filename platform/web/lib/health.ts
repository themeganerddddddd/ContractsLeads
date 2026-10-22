import "server-only";
import { query } from "@/lib/db";
import { deriveHealthStatus, type HealthRun } from "@/lib/health-model";

export async function getIngestionHealth() {
  const [runs, jobs, inventory, sourceCheckpoints, markets, capacity] = await Promise.all([
    query<HealthRun>(
      `SELECT source,status,completed_at::text,records_received::text,records_failed::text,duration_ms::text,error_summary,metadata
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
    ),
    query<any>(
      `SELECT DISTINCT ON (source_system) source_system,checkpoint_key,checkpoint_value,status,
       records_seen::text,records_written::text,error_summary,metadata,updated_at::text
       FROM source_checkpoints ORDER BY source_system,updated_at DESC`
    ),
    query<any>(
      `SELECT p.source_market,p.source_system,count(DISTINCT p.id)::text AS processes,
       count(DISTINCT ps.company_id)::text AS suppliers,count(DISTINCT p.buyer_id)::text AS buyers,
       min(p.published_at)::date::text AS coverage_start,max(p.published_at)::date::text AS coverage_end
       FROM procurement_processes p LEFT JOIN procurement_process_suppliers ps ON ps.process_id=p.id
       WHERE NOT p.is_demo GROUP BY p.source_market,p.source_system ORDER BY p.source_market`
    ),
    query<any>(
      `SELECT pg_database_size(current_database())::text AS database_bytes,
       current_setting('server_version') AS postgres_version,
       o.capacity_bytes::text,o.utilization::text,o.warning_threshold::text,o.stop_threshold::text,
       o.decision,o.observed_at::text
       FROM (SELECT 1) q LEFT JOIN LATERAL (
         SELECT capacity_bytes,utilization,warning_threshold,stop_threshold,decision,observed_at
         FROM capacity_observations ORDER BY observed_at DESC LIMIT 1
       ) o ON true`
    )
  ]);
  const derived = deriveHealthStatus(runs);
  for (const checkpoint of sourceCheckpoints) {
    if (checkpoint.status === "failed") derived.reasons.push(`latest ${checkpoint.source_system} checkpoint failed`);
  }
  if (capacity[0]?.decision === "stop") derived.reasons.push("database capacity guard is stopped");
  if (derived.reasons.length && derived.status === "healthy") derived.status = "degraded";
  return {
    ...derived,
    checkedAt: new Date().toISOString(),
    inventory: inventory[0],
    runs,
    backfills: jobs,
    sourceCheckpoints,
    markets,
    capacity: capacity[0]
  };
}
