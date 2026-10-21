import { currentUser, ensureDatabaseUser } from "@/lib/auth-user";
import {
  billingEnabled,
  developmentMockEnabled,
  publicAppUrl,
} from "@/lib/config";
import { query } from "@/lib/db";
import { stripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  const origin = publicAppUrl();
  if (!billingEnabled() && !developmentMockEnabled("DEV_STRIPE"))
    return Response.json({ error: "Billing is not enabled" }, { status: 503 });
  const stripe = stripeClient();
  if (!stripe && developmentMockEnabled("DEV_STRIPE"))
    return Response.json({ url: `${origin}/pricing?mock_portal=true` });
  if (!stripe)
    return Response.json(
      { error: "Stripe is not configured" },
      { status: 503 },
    );
  const id = await ensureDatabaseUser(user);
  const rows = await query<{ provider_customer_id: string }>(
    "SELECT provider_customer_id FROM subscriptions WHERE user_id=$1 AND provider='stripe' AND provider_customer_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
    [id],
  );
  if (!rows.length)
    return Response.json(
      { error: "No Stripe customer found" },
      { status: 404 },
    );
  const session = await stripe.billingPortal.sessions.create({
    customer: rows[0].provider_customer_id,
    return_url: `${origin}/pricing`,
  });
  return Response.json({ url: session.url });
}
