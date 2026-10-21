import { z } from "zod";
import { currentUser, ensureDatabaseUser } from "@/lib/auth-user";
import {
  billingEnabled,
  developmentMockEnabled,
  publicAppUrl,
} from "@/lib/config";
import { stripeClient, stripePrice } from "@/lib/stripe";

const schema = z.object({
  plan: z.enum(["local", "pro", "analyst"]),
  billing: z.enum(["monthly", "annual"]).default("monthly"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  if (parsed.data.plan === "analyst" && parsed.data.billing === "annual")
    return Response.json({ error: "Analyst is monthly only" }, { status: 400 });
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  const origin = publicAppUrl();
  if (!billingEnabled() && !developmentMockEnabled("DEV_STRIPE")) {
    return Response.json({ error: "Billing is not enabled" }, { status: 503 });
  }
  const stripe = stripeClient();
  if (!stripe && developmentMockEnabled("DEV_STRIPE"))
    return Response.json({
      url: `${origin}/pricing?mock_checkout=${parsed.data.plan}`,
    });
  const price = stripePrice(parsed.data.plan, parsed.data.billing);
  if (!stripe || !price)
    return Response.json(
      { error: "Stripe is not configured" },
      { status: 503 },
    );
  const userId = await ensureDatabaseUser(user);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [{ price, quantity: 1 }],
    success_url: `${origin}/pricing?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    client_reference_id: userId,
    metadata: { userId, plan: parsed.data.plan },
  });
  return Response.json({ url: session.url });
}
