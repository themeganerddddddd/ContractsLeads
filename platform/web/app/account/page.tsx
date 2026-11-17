import Link from "next/link";

import { AccountSignOutButton } from "@/components/AccountSignOutButton";
import { BillingPortalButton } from "@/components/BillingPortalButton";
import { authProviderAvailability } from "@/lib/config";
import { resolveViewer } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account", description: "Manage your BusinessCurrent account, plan, saved searches, and alerts." };

const displayPlan: Record<string, string> = { free: "Free", local: "Starter", pro: "Pro", analyst: "Analyst", organization: "Organization" };
const displayStatus: Record<string, string> = {
  active: "Active",
  trialing: "Trialing",
  canceled: "Canceled",
  past_due: "Payment issue",
  unpaid: "Unpaid",
  incomplete: "Activation incomplete",
  incomplete_expired: "Expired",
  paused: "Paused",
  development: "Development access",
};

export default async function AccountPage() {
  const viewer = await resolveViewer();
  const providers = authProviderAvailability();
  return <section className="account-shell">
    <div className="page-heading"><p className="eyebrow">Account</p><h1>Your BusinessCurrent workspace</h1><p>See your access level and move directly to saved research, alerts, or subscription management.</p></div>
    {!viewer.user ? <div className="account-card"><h2>Sign in to save your work</h2><p>{providers.google || providers.github ? "Use a configured identity provider to access saved searches, tracking, and billing." : "Public search is available now. Account sign-in has not yet been configured by the site owner."}</p>{providers.google || providers.github ? <Link className="button primary" href="/sign-in?next=/account">Sign in</Link> : <Link className="button secondary" href="/companies">Search companies</Link>}</div> : <>
      <div className="account-grid">
        <div className="account-card"><span>Signed in as</span><h2>{viewer.user.name}</h2><p>{viewer.user.email}</p><AccountSignOutButton /></div>
        <div className="account-card"><span>Current plan</span><h2>{displayPlan[viewer.plan]}</h2><p>{viewer.plan === "free" ? "Upgrade for full result sets, deeper history, and paid workspace features." : "Your active paid access is reflected across BusinessCurrent."}</p><p><strong>Subscription status:</strong> {viewer.subscriptionStatus ? displayStatus[viewer.subscriptionStatus] || viewer.subscriptionStatus.replaceAll("_", " ") : "Free access"}</p>{viewer.hasBillingAccount ? <BillingPortalButton /> : <Link className="button primary" href="/pricing">See plans</Link>}</div>
      </div>
      <div className="account-links"><Link href="/saved-searches">Saved searches</Link><Link href="/tracked-companies">Tracked companies</Link><Link href="/alerts">Alerts</Link><Link href="/companies">Company screener</Link></div>
    </>}
  </section>;
}
