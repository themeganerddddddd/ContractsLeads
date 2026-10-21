import "server-only";
import { currentUser, ensureDatabaseUser } from "@/lib/auth-user";
import { developmentPlan } from "@/lib/config";
import { query } from "@/lib/db";
import { normalizePlan, type Plan } from "@/lib/entitlements";

export async function resolvePlan(): Promise<Plan> {
  const configuredDevelopmentPlan = developmentPlan();
  if (configuredDevelopmentPlan)
    return normalizePlan(configuredDevelopmentPlan);
  const user = await currentUser();
  if (!user) return "free";
  const userId = await ensureDatabaseUser(user);
  const rows = await query<{ plan: string }>(
    `SELECT plan FROM subscriptions WHERE user_id=$1 AND status IN ('active','trialing')
     AND (period_end IS NULL OR period_end > now()) ORDER BY updated_at DESC LIMIT 1`,
    [userId],
  );
  return normalizePlan(rows[0]?.plan);
}
