export type HealthRun = {
  source: string;
  status: "success" | "partial" | "failed";
  completed_at: string;
  records_received: string;
  records_failed: string;
  duration_ms: string | null;
  error_summary: string | null;
};

export type HealthStatus = "healthy" | "degraded" | "initializing";

export function deriveHealthStatus(runs: HealthRun[], now = new Date()): { status: HealthStatus; reasons: string[] } {
  const reasons: string[] = [];
  const daily = runs.find((run) => run.source === "usaspending" && run.status === "success");
  if (!daily) reasons.push("no successful daily ingestion has completed");
  else if (now.getTime() - new Date(daily.completed_at).getTime() > 48 * 60 * 60 * 1000) reasons.push("daily ingestion is older than 48 hours");
  const latestBySource = new Map<string, HealthRun>();
  for (const run of runs) if (!latestBySource.has(run.source)) latestBySource.set(run.source, run);
  for (const run of latestBySource.values()) {
    if (run.status === "failed") reasons.push(`latest ${run.source} run failed`);
    if (run.status === "partial") reasons.push(`latest ${run.source} run was partial`);
  }
  if (!runs.length || (!daily && reasons.length === 1)) return { status: "initializing", reasons };
  return { status: reasons.length ? "degraded" : "healthy", reasons };
}
