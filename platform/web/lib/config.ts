export type RuntimeEnvironment = Record<string, string | undefined>;

const productionRequired = [
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "AUTH_SECRET",
  "INTERNAL_HEALTH_TOKEN",
] as const;

const oauthRequired = ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] as const;

const billingRequired = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_LOCAL_MONTHLY",
  "STRIPE_PRICE_LOCAL_ANNUAL",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_ANNUAL",
  "STRIPE_PRICE_ANALYST_MONTHLY",
] as const;

export function validateRuntimeConfig(
  env: RuntimeEnvironment = process.env,
): void {
  if (!isProduction(env)) return;
  const missing = productionRequired.filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new Error(
      `Production configuration is missing: ${missing.join(", ")}`,
    );

  if (!["true", "false"].includes(env.AUTH_ENABLED || "")) {
    throw new Error(
      "Production configuration requires AUTH_ENABLED=true or AUTH_ENABLED=false",
    );
  }
  if (env.AUTH_ENABLED === "true") {
    const missingOauth = oauthRequired.filter((name) => !env[name]?.trim());
    if (missingOauth.length) {
      throw new Error(
        `Enabled authentication is missing configuration: ${missingOauth.join(", ")}`,
      );
    }
  }

  if (!["true", "false"].includes(env.BILLING_ENABLED || "")) {
    throw new Error(
      "Production configuration requires BILLING_ENABLED=true or BILLING_ENABLED=false",
    );
  }
  if (env.BILLING_ENABLED === "true") {
    const missingBilling = billingRequired.filter((name) => !env[name]?.trim());
    if (missingBilling.length) {
      throw new Error(
        `Enabled billing is missing configuration: ${missingBilling.join(", ")}`,
      );
    }
  }

  const unsafeOverride = env.ALLOW_UNSAFE_PRODUCTION_MOCKS === "true";
  const unsafe: string[] = ["DEV_AUTH", "DEV_STRIPE"].filter(
    (name) => env[name] === "true",
  );
  if (env.DEV_PLAN?.trim()) unsafe.push("DEV_PLAN");
  if (unsafe.length && !unsafeOverride) {
    throw new Error(
      `Production mock modes are forbidden: ${unsafe.join(", ")}`,
    );
  }
}

export function isProduction(env: RuntimeEnvironment = process.env): boolean {
  return env.APP_ENV === "production" || env.NODE_ENV === "production";
}

export function developmentMockEnabled(
  name: "DEV_AUTH" | "DEV_STRIPE",
  env: RuntimeEnvironment = process.env,
): boolean {
  if (env[name] !== "true") return false;
  return !isProduction(env) || env.ALLOW_UNSAFE_PRODUCTION_MOCKS === "true";
}

export function billingEnabled(env: RuntimeEnvironment = process.env): boolean {
  return env.BILLING_ENABLED === "true";
}

export function authEnabled(env: RuntimeEnvironment = process.env): boolean {
  return env.AUTH_ENABLED === "true";
}

export function developmentPlan(
  env: RuntimeEnvironment = process.env,
): string | undefined {
  if (!env.DEV_PLAN?.trim()) return undefined;
  return !isProduction(env) || env.ALLOW_UNSAFE_PRODUCTION_MOCKS === "true"
    ? env.DEV_PLAN
    : undefined;
}

export function publicAppUrl(env: RuntimeEnvironment = process.env): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    if (env.APP_ENV === "production" || env.VERCEL_ENV === "production") {
      throw new Error("NEXT_PUBLIC_APP_URL is required in production");
    }
    return "http://localhost:3000";
  }
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("NEXT_PUBLIC_APP_URL must use http or https");
  return url.origin;
}
