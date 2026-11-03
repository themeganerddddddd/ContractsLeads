import "server-only";
import { currentUser, ensureDatabaseUser, type AppUser } from "@/lib/auth-user";
import { developmentPlan } from "@/lib/config";
import { query } from "@/lib/db";
import { normalizePlan, type Plan } from "@/lib/entitlements";

export type ViewerContext = {
  plan: Plan;
  user: AppUser | null;
  userId: string | null;
};

export async function resolveViewer(): Promise<ViewerContext> {
  const configuredDevelopmentPlan = developmentPlan();
  const user = await currentUser();
  if (!user)
    return {
      plan: configuredDevelopmentPlan
        ? normalizePlan(configuredDevelopmentPlan)
        : "free",
      user: null,
      userId: null,
    };
  const userId = await ensureDatabaseUser(user);
  if (configuredDevelopmentPlan)
    return {
      plan: normalizePlan(configuredDevelopmentPlan),
      user,
      userId,
    };
  const rows = await query<{ plan: string }>(
    `SELECT plan FROM subscriptions WHERE user_id=$1 AND status IN ('active','trialing')
     AND (period_end IS NULL OR period_end > now()) ORDER BY updated_at DESC LIMIT 1`,
    [userId],
  );
  return { plan: normalizePlan(rows[0]?.plan), user, userId };
}

export async function resolvePlan(): Promise<Plan> {
  return (await resolveViewer()).plan;
}
