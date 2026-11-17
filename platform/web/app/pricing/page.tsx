import Link from "next/link";

import { BillingButton } from "@/components/BillingButton";
import { BillingPortalButton } from "@/components/BillingPortalButton";
import { CheckoutActivationStatus } from "@/components/CheckoutActivationStatus";
import { resolveViewer } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans", description: "BusinessCurrent plans for company intelligence, screening, alerts, tracking, and exports." };

type RawParams = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const displayPlan: Record<string, string> = { free: "Free", local: "Starter", pro: "Pro", analyst: "Analyst", organization: "Organization" };

const plans: Array<{ slug: "free" | "local" | "pro" | "analyst"; name: string; price: string; note: string; features: string[]; featured?: boolean }> = [
  { slug: "free", name: "Free", price: "$0", note: "forever", features: ["Basic company and location search", "20 results per search", "Company profile preview", "30 days of supported history"] },
  { slug: "local", name: "Starter", price: "$15", note: "/ month · $150 annually", features: ["Full company and location result sets", "Five years of supported history", "Saved searches", "Weekly alerts"] },
  { slug: "pro", name: "Pro", price: "$39", note: "/ month · $390 annually", featured: true, features: ["Everything in Starter", "Advanced company screening", "Validated prediction filters when available", "Company tracking and daily alerts", "CSV export · 25,000 rows/month", "Full supported history"] },
  { slug: "analyst", name: "Analyst", price: "$99", note: "/ month", features: ["Everything in Pro", "Larger result sets", "CSV export · 250,000 rows/month", "Advanced screening and custom regions"] },
];

export default async function PricingPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const [raw, viewer] = await Promise.all([searchParams, resolveViewer()]);
  const checkout = one(raw.checkout);
  const checkoutPlan = one(raw.checkoutPlan);
  const billing = one(raw.billing) === "annual" ? "annual" : "monthly";
  const validCheckoutPlan = ["local", "pro", "analyst"].includes(checkoutPlan || "") ? checkoutPlan! : "";
  const salesEmail = process.env.NEXT_PUBLIC_SALES_EMAIL?.trim();
  return <>
    <section className="page-heading pricing-heading">
      <p className="eyebrow">Straightforward plans</p>
      <h1>Start free. Upgrade when the intelligence earns it.</h1>
      <p>Search real companies at no cost, then unlock deeper screening, history, alerts, tracking, and exports.</p>
      <div className="current-plan"><span>Current plan</span><strong>{displayPlan[viewer.plan]}</strong>{viewer.user ? <Link href="/account">View account</Link> : <Link href="/sign-in?next=/pricing">Sign in</Link>}</div>
    </section>

    {checkout === "success" && validCheckoutPlan ? <CheckoutActivationStatus intendedPlan={validCheckoutPlan} /> : null}
    {checkout === "cancelled" ? <section className="checkout-state"><h2>Checkout cancelled</h2><p>No charge was made. Your current plan is unchanged.</p></section> : null}
    {validCheckoutPlan && checkout !== "success" && viewer.plan === "free" ? <section className="checkout-resume"><p>Continuing to {displayPlan[validCheckoutPlan]} checkout…</p><BillingButton plan={validCheckoutPlan} billing={billing} autoStart>Continue to secure checkout</BillingButton></section> : null}

    <section className="pricing-grid" aria-label="BusinessCurrent plans">
      {plans.map((plan) => <article id={plan.slug} className={`price-card ${plan.featured ? "featured" : ""} ${viewer.plan === plan.slug ? "current" : ""}`} key={plan.slug}>
        {plan.featured ? <span className="plan-badge">Most Popular</span> : null}
        {viewer.plan === plan.slug ? <span className="current-badge">Current plan</span> : null}
        <h2>{plan.name}</h2>
        <div className="price">{plan.price} <small>{plan.note}</small></div>
        <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        {plan.slug === "free" ? <Link className="button secondary" href="/companies">Search free</Link> : <div className="plan-actions"><BillingButton plan={plan.slug}>Choose {plan.name} monthly</BillingButton>{plan.slug !== "analyst" ? <BillingButton plan={plan.slug} billing="annual">Choose annual</BillingButton> : null}</div>}
      </article>)}
      {salesEmail ? <article className="price-card"><h2>Organization</h2><div className="price">Custom</div><ul><li>Team access and higher limits</li><li>Scoped deployment support</li><li>Contact us to confirm requirements</li></ul><a className="button secondary" href={`mailto:${salesEmail}`}>Contact sales</a></article> : null}
    </section>
    {viewer.plan !== "free" ? <section className="subscription-panel"><div><p className="eyebrow">Billing</p><h2>Manage your subscription</h2><p>Update payment details, view invoices, or change your Stripe subscription securely.</p></div><BillingPortalButton /></section> : null}
    <p className="notice">Prediction probabilities appear only when a calibrated model passes the documented validation and sufficiency gates. Signal-only views remain clearly labeled.</p>
  </>;
}
