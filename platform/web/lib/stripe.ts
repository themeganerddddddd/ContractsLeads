import "server-only";
import Stripe from "stripe";
import { billingEnabled, validateRuntimeConfig } from "@/lib/config";

let client: Stripe | undefined;

export function stripeClient(): Stripe | null {
  validateRuntimeConfig();
  if (!billingEnabled()) return null;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export function stripePrice(plan: string, billing: string): string | null {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${billing.toUpperCase()}`;
  return process.env[key] || null;
}
