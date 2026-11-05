import "server-only";
import { currentUser, ensureDatabaseUser, type AppUser } from "@/lib/auth-user";
import { developmentPlan } from "@/lib/config";
import { query } from "@/lib/db";
import { normalizePlan, type Plan } from "@/lib/entitlements";

export type ViewerContext = {
  plan: Plan;
  user: AppUser | null;
  userId: string | null;
  subscriptionStatus: string | null;
  hasBillingAccount: boolean;
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
      subscriptionStatus: null,
      hasBillingAccount: false,
    };
  const userId = await ensureDatabaseUser(user);
  if (configuredDevelopmentPlan)
    return {
      plan: normalizePlan(configuredDevelopmentPlan),
      user,
      userId,
      subscriptionStatus: "development",
      hasBillingAccount: false,
    };
  const rows = await query<{
    plan: string;
    status: string;
    entitled: boolean;
    has_billing_account: boolean;
  }>(
    `SELECT plan,status,
       (status IN ('active','trialing') AND (period_end IS NULL OR period_end > now())) AS entitled,
       (provider='stripe' AND provider_customer_id IS NOT NULL) AS has_billing_account
     FROM subscriptions WHERE user_id=$1
     ORDER BY (status IN ('active','trialing') AND (period_end IS NULL OR period_end > now())) DESC,
       updated_at DESC LIMIT 1`,
    [userId],
  );
  const subscription = rows[0];
  return {
    plan: subscription?.entitled ? normalizePlan(subscription.plan) : "free",
    user,
    userId,
    subscriptionStatus: subscription?.status || null,
    hasBillingAccount: subscription?.has_billing_account === true,
  };
}

export async function resolvePlan(): Promise<Plan> {
  return (await resolveViewer()).plan;
}
