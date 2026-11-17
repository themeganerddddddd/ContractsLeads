import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth-user";
import { authEnabled, developmentMockEnabled } from "@/lib/config";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Owner overview",
  robots: { index: false, follow: false },
};

type UserCount = { total: number };
type SubscriptionCount = { paid_accounts: number; active_subscriptions: number; payment_issues: number };

export default async function OwnerOverview() {
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  // Never expose admin stats without an explicitly configured owner and real OAuth session.
  if (!owner || !authEnabled() || developmentMockEnabled("DEV_AUTH")) notFound();
  const user = await currentUser();
  if (!user || user.email.toLowerCase() !== owner) notFound();

  let stats: { users: number; paid: number; active: number; issues: number } | null = null;
  try {
    const [[userRow], [subRow]] = await Promise.all([
      query<UserCount>("SELECT count(*)::int AS total FROM users"),
      query<SubscriptionCount>(`
        SELECT
          count(DISTINCT CASE WHEN status IN ('active', 'trialing')
            AND (period_end IS NULL OR period_end > now()) THEN user_id END)::int AS paid_accounts,
          count(*) FILTER (WHERE status IN ('active', 'trialing')
            AND (period_end IS NULL OR period_end > now()))::int AS active_subscriptions,
          count(*) FILTER (WHERE status IN ('past_due', 'unpaid'))::int AS payment_issues
        FROM subscriptions WHERE provider = 'stripe'
      `),
    ]);
    stats = {
      users: userRow?.total ?? 0,
      paid: subRow?.paid_accounts ?? 0,
      active: subRow?.active_subscriptions ?? 0,
      issues: subRow?.payment_issues ?? 0,
    };
  } catch {
    // Failed database access must not be misrepresented as zero users or revenue.
  }

  return <section className="account-shell">
    <div className="page-heading">
      <p className="eyebrow">FirmQuarry / Private</p>
      <h1>Owner overview</h1>
      <p>Basic account and subscription counts. Stripe is the source of truth for payments and revenue.</p>
    </div>
    {stats ? <div className="account-grid">
      <div className="account-card"><span>Registered accounts</span><h2>{stats.users.toLocaleString()}</h2></div>
      <div className="account-card"><span>Paying accounts</span><h2>{stats.paid.toLocaleString()}</h2></div>
      <div className="account-card"><span>Active subscriptions</span><h2>{stats.active.toLocaleString()}</h2></div>
      <div className="account-card"><span>Subscriptions with payment issues</span><h2>{stats.issues.toLocaleString()}</h2></div>
    </div> : <div className="account-card"><strong>Live account counts unavailable.</strong><p>Check the database connection and required schema. No figures have been estimated.</p></div>}
    <div className="account-card">
      <h2>Operations</h2>
      <p><a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer">Stripe Dashboard ↗</a> — actual payments, recurring revenue, refunds, and customer subscriptions.</p>
      <p><Link href="/support">Customer support page</Link> — review support submissions in your configured email inbox; this release does not yet store them in the database.</p>
      <p>Visitor and acquisition analytics require a separately configured analytics service. No invented visitor counts are shown here.</p>
    </div>
  </section>;
}
