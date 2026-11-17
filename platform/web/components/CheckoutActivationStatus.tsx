"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const planNames: Record<string, string> = {
  local: "Starter",
  pro: "Pro",
  analyst: "Analyst",
  organization: "Organization",
};

export function CheckoutActivationStatus({ intendedPlan }: { intendedPlan: string }) {
  const [plan, setPlan] = useState("free");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function check() {
      attempts += 1;
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" });
        if (response.ok) {
          const payload = await response.json();
          if (cancelled) return;
          setPlan(payload.plan || "free");
          if (payload.plan !== "free") {
            setChecking(false);
            return;
          }
        }
      } catch {
        // Keep the honest activation state and retry briefly while the webhook arrives.
      }
      if (!cancelled && attempts < 12) timer = setTimeout(check, 2500);
      else if (!cancelled) setChecking(false);
    }
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (plan !== "free") {
    return <section className="checkout-state checkout-success" role="status"><p className="eyebrow">Subscription active</p><h2>Welcome to BusinessCurrent {planNames[plan] || plan}.</h2><p>Your paid access is active. Continue directly to the company screener.</p><Link className="button primary" href="/companies">Search companies</Link></section>;
  }
  return <section className="checkout-state" role="status"><p className="eyebrow">Checkout completed</p><h2>{checking ? "Activating your subscription…" : "We’re still confirming your subscription."}</h2><p>Stripe may take a moment to deliver the signed billing event. This page will not claim paid access until your {planNames[intendedPlan] || intendedPlan} entitlement is recorded.</p>{checking ? <span className="activation-pulse" aria-hidden="true" /> : <p><Link href="/account">Check your account</Link> or refresh this page in a moment.</p>}</section>;
}
