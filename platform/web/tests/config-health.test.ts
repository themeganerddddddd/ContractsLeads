import { describe, expect, it } from "vitest";
import {
  alertEmailEnabled,
  authEnabled,
  developmentMockEnabled,
  developmentPlan,
  validateRuntimeConfig,
} from "@/lib/config";
import { deriveHealthStatus, type HealthRun } from "@/lib/health-model";

const completeProduction = {
  APP_ENV: "production",
  DATABASE_URL: "postgres://pooled",
  NEXT_PUBLIC_APP_URL: "https://example.test",
  AUTH_SECRET: "secret",
  AUTH_ENABLED: "true",
  AUTH_GITHUB_ID: "id",
  AUTH_GITHUB_SECRET: "secret",
  INTERNAL_HEALTH_TOKEN: "secret",
  BILLING_ENABLED: "false",
  DEV_AUTH: "false",
  DEV_STRIPE: "false",
};

describe("production configuration", () => {
  it("rejects implicit development auth and billing in production", () => {
    expect(() =>
      validateRuntimeConfig({ ...completeProduction, DEV_AUTH: "true" }),
    ).toThrow(/DEV_AUTH/);
    expect(() =>
      validateRuntimeConfig({ ...completeProduction, DEV_PLAN: "pro" }),
    ).toThrow(/DEV_PLAN/);
  });
  it("rejects missing production secrets but ignores local development", () => {
    expect(() =>
      validateRuntimeConfig({
        APP_ENV: "production",
        DEV_AUTH: "false",
        DEV_STRIPE: "false",
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      validateRuntimeConfig({
        NODE_ENV: "production",
        BILLING_ENABLED: "false",
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      validateRuntimeConfig({
        APP_ENV: "development",
        DEV_AUTH: "true",
        DEV_STRIPE: "true",
      }),
    ).not.toThrow();
  });
  it("accepts a fully configured production environment", () => {
    expect(() => validateRuntimeConfig(completeProduction)).not.toThrow();
  });
  it("supports an anonymous production beta without OAuth credentials", () => {
    const { AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, ...anonymousProduction } =
      completeProduction;
    expect(() =>
      validateRuntimeConfig({
        ...anonymousProduction,
        AUTH_ENABLED: "false",
      }),
    ).not.toThrow();
    expect(
      authEnabled({ APP_ENV: "production", AUTH_ENABLED: "false" }),
    ).toBe(false);
  });
  it("requires OAuth credentials when production authentication is enabled", () => {
    const { AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, ...missingOauth } =
      completeProduction;
    expect(() => validateRuntimeConfig(missingOauth)).toThrow(
      /AUTH_GITHUB_ID/,
    );
  });
  it("requires Stripe settings only when billing is enabled", () => {
    expect(() =>
      validateRuntimeConfig({ ...completeProduction, BILLING_ENABLED: "true" }),
    ).toThrow(/STRIPE_SECRET_KEY/);
    expect(() =>
      validateRuntimeConfig({
        ...completeProduction,
        BILLING_ENABLED: "true",
        STRIPE_SECRET_KEY: "secret",
        STRIPE_WEBHOOK_SECRET: "secret",
        STRIPE_PRICE_LOCAL_MONTHLY: "p1",
        STRIPE_PRICE_LOCAL_ANNUAL: "p2",
        STRIPE_PRICE_PRO_MONTHLY: "p3",
        STRIPE_PRICE_PRO_ANNUAL: "p4",
        STRIPE_PRICE_ANALYST_MONTHLY: "p5",
      }),
    ).not.toThrow();
  });
  it("does not activate development mocks when their flags are absent", () => {
    expect(developmentMockEnabled("DEV_AUTH", { APP_ENV: "development" })).toBe(
      false,
    );
    expect(
      developmentMockEnabled("DEV_STRIPE", {
        APP_ENV: "development",
        DEV_STRIPE: "true",
      }),
    ).toBe(true);
    expect(
      developmentMockEnabled("DEV_AUTH", {
        NODE_ENV: "production",
        DEV_AUTH: "true",
      }),
    ).toBe(false);
    expect(developmentPlan({ APP_ENV: "development", DEV_PLAN: "pro" })).toBe(
      "pro",
    );
    expect(
      developmentPlan({ NODE_ENV: "production", DEV_PLAN: "pro" }),
    ).toBeUndefined();
  });
  it("keeps outbound alert email off unless explicitly enabled", () => {
    expect(alertEmailEnabled({})).toBe(false);
    expect(alertEmailEnabled({ ALERT_EMAIL_ENABLED: "false" })).toBe(false);
    expect(alertEmailEnabled({ ALERT_EMAIL_ENABLED: "true" })).toBe(true);
  });
});

describe("ingestion health model", () => {
  const run = (overrides: Partial<HealthRun> = {}): HealthRun => ({
    source: "usaspending",
    status: "success",
    completed_at: "2026-10-12T10:00:00Z",
    records_received: "10",
    records_failed: "0",
    duration_ms: "50",
    error_summary: null,
    metadata: {},
    ...overrides,
  });
  it("is healthy for a recent successful daily run", () => {
    expect(
      deriveHealthStatus([run()], new Date("2026-10-12T12:00:00Z")),
    ).toEqual({ status: "healthy", reasons: [] });
  });
  it("is degraded for stale or latest failed ingestion", () => {
    expect(
      deriveHealthStatus([run()], new Date("2026-10-15T12:00:00Z")).status,
    ).toBe("degraded");
    expect(
      deriveHealthStatus([
        run({ status: "failed" }),
        run({ completed_at: "2026-10-11T10:00:00Z" }),
      ]).status,
    ).toBe("degraded");
  });
  it("reports an empty database as initializing", () => {
    expect(deriveHealthStatus([]).status).toBe("initializing");
  });
  it("does not degrade for an intentional bounded validation run without failures", () => {
    expect(
      deriveHealthStatus([
        run({
          source: "usaspending_reconciliation",
          status: "partial",
          records_failed: "0",
          metadata: { bounded_limit: 100, limit_reached: true },
        }),
        run(),
      ], new Date("2026-10-12T12:00:00Z")),
    ).toEqual({ status: "healthy", reasons: [] });
  });
});
