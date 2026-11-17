import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseCompanyScreenerInput, parsePredictionInput } from "@/lib/company-screener-input";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("sellable BusinessCurrent V1", () => {
  it("parses professional company filters and defaults to money-first sorting", () => {
    expect(parseCompanyScreenerInput({ q: "  Peraton ", country: "us", state: "va", government_min: "1000000", obligations_12m_min: "250000", known_locations: "2", tracked: "true" })).toMatchObject({
      q: "Peraton",
      country: "US",
      state: "VA",
      governmentMin: 1_000_000,
      obligations12mMin: 250_000,
      knownLocations: 2,
      trackedOnly: true,
      sort: "government_desc",
    });
    expect(parseCompanyScreenerInput({ sort: "obligations_12m_desc" }).sort).toBe("obligations_12m_desc");
  });

  it("implements exact net-obligation definitions and negative-only suppression", () => {
    const source = read("lib/company-intelligence.ts");
    expect(source).toContain("sum(t.obligation)");
    expect(source).toContain("current_date - interval '365 days'");
    expect(source).toContain("bool_or(t.obligation > 0) AS has_positive_transaction");
    expect(source).toContain("COALESCE(ta.has_positive_transaction,false)");
    expect(source).toContain("COALESCE(aa.has_positive_award,false)");
    expect(source).toContain("COALESCE(ea.has_operating_location,false)");
    expect(source).toContain("OR EXISTS (SELECT 1 FROM company_watches");
    expect(source).not.toContain("t.obligation <> 0) AS has_positive_transaction");
  });

  it("uses money-first SQL sorts and dependent geography option queries", () => {
    const source = read("lib/company-intelligence.ts");
    expect(source).toContain("government_business::numeric DESC NULLS LAST");
    expect(source).toContain("obligations_12m::numeric DESC NULLS LAST");
    expect(source).toContain("$2::text IS NOT NULL AND recipient_state=$2");
    expect(source).toContain("($3::text IS NULL OR recipient_county=$3)");
    const locations = read("app/locations/page.tsx");
    expect(locations).not.toContain("Montgomery County");
    expect(locations).not.toContain("featured markets");
  });

  it("keeps prediction probabilities behind model and sufficiency gates", () => {
    expect(parsePredictionInput({ horizon: "365", recency: "90" })).toMatchObject({ horizon: 365, recencyDays: 90 });
    const component = read("components/PredictionScreener.tsx");
    expect(component).toContain('row.probability_eligible === true');
    expect(component).toContain('row.model_status === "active"');
    expect(component).toContain('row.prediction_sufficiency === "sufficient"');
    expect(component).toContain("Prediction not yet available");
    expect(component).toContain("Destination unknown");
  });

  it("preserves checkout intent through sign-in and waits for webhook entitlement", () => {
    const button = read("components/BillingButton.tsx");
    expect(button).toContain("response.status === 401");
    expect(button).toContain("/sign-in?next=");
    expect(button).toContain("checkoutPlan=");
    const checkout = read("app/api/billing/checkout/route.ts");
    expect(checkout).toContain("{CHECKOUT_SESSION_ID}");
    expect(checkout).toContain("mode: \"subscription\"");
    const webhook = read("app/api/billing/webhook/route.ts");
    expect(webhook).toContain("stripe.subscriptions.retrieve(subscription)");
    expect(webhook).toContain("stripeSubscription.status");
    const status = read("app/api/billing/status/route.ts");
    expect(status).toContain("resolveViewer");
    expect(read("components/CheckoutActivationStatus.tsx")).toContain("Activating your subscription");
  });

  it("exposes the existing Stripe portal and current plan without placeholder sales claims", () => {
    expect(read("app/api/billing/portal/route.ts")).toContain("stripe.billingPortal.sessions.create");
    const account = read("app/account/page.tsx");
    expect(account).toContain("Current plan");
    expect(account).toContain("Subscription status:");
    const pricing = read("app/pricing/page.tsx");
    expect(pricing).toContain("Manage your subscription");
    expect(read("components/BillingPortalButton.tsx")).toContain("Manage subscription");
    expect(pricing).toContain("NEXT_PUBLIC_SALES_EMAIL");
    expect(pricing).not.toContain("sales@example.test");
    expect(pricing).not.toContain("API access");
    expect(pricing).not.toContain("XLSX");
  });

  it("uses the configured public contact without a placeholder fallback", () => {
    for (const path of ["components/Footer.tsx", "app/terms/page.tsx", "app/privacy/page.tsx"]) {
      const source = read(path);
      expect(source).toContain("NEXT_PUBLIC_SALES_EMAIL");
      expect(source).not.toContain("sales@example.test");
      expect(source).not.toContain("developer@example.test");
    }
  });
});
