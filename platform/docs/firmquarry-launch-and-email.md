# FirmQuarry — rebrand, email and release notes

## Domain and business email

- **Domain:** `firmquarry.com`, purchased through Vercel in the `west-tech` team.
- **Customer support:** `support@firmquarry.com`, forwarded to the founder's existing personal Gmail inbox via [Forward Email](https://forwardemail.net).
- **Verified by the founder on November 17, 2026:** a test message reached the Gmail inbox.
- **Current Vercel DNS:** root MX `mx1.forwardemail.net` and `mx2.forwardemail.net` (both priority 0), and one encrypted root `forward-email=` TXT record.
- **Privacy:** do not expose or commit the private destination or encrypted forwarding value. The public address is displayed by default in the code.
- **Important:** forwarding receives messages only. Gmail replies will use the Gmail address unless a separately authenticated sending identity/mailbox is configured. Keep personal Gmail as default for unrelated messages.

## New navigation and pages (November 17, 2026)

- `/` — **public marketing homepage** with premium explanation of the product, truthful capability cards, a sign-in panel (Google/GitHub buttons only when configured), and conspicuous links to `/pricing`. Offers public exploration if sign-in is not ready.
- `/workspace` — **existing research overview**, preserved from the former `/` implementation. State/county market selection and automatic location navigation now keep visitors on `/workspace`.
- `/pricing` — existing public Free/Starter/Pro/Analyst subscription plans. It is deliberately **not linked from the research sidebar**; it appears in the public home/header and via My Account.
- `/sign-in` — public sign-in page, reachable from the public header. Account provider availability remains configuration-gated.
- Research sidebar — **My Account** with **Help & Feedback directly underneath**. Pricing no longer appears in sidebar menus. The former floating help pill has been removed.
- `/support` — centered two-column support layout with a usable form. When the Resend/Turnstile service is not configured, submitting opens a **prefilled email draft** to `support@firmquarry.com` in the visitor's mail app. The visitor reviews and sends it; no backend-delivery claim is made. When the verified backend is configured, it submits through `/api/support`.
- `/account` — single place for user profile, account subscription status and self-service billing. No separate private owner dashboard; `/admin` was deleted.

## Activating automatic support form delivery (optional)

The support page already provides an email-draft fallback. To send feedback automatically from the web form instead:

1. Verify an outbound **sending subdomain** (for example `notify.firmquarry.com`) in Resend, preserving the existing inbound MX records on the root domain.
2. Configure Cloudflare Turnstile for the final site hostname.
3. Set Vercel environment variables:
   ```env
   SUPPORT_INBOX_EMAIL=<private destination; server only>
   RESEND_FROM_EMAIL=FirmQuarry <feedback@notify.firmquarry.com>
   RESEND_API_KEY=<server-only API key>
   TURNSTILE_SECRET_KEY=<server-only Turnstile secret>
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<public Turnstile site key>
   ```
4. Redeploy and submit an independent test. Verify receipt before advertising automated form delivery. The backend validates same-origin POST, message size, honeypot and Turnstile, and does not persist tickets in the database.

Do not paste live secrets into repository files or chat.

## Accounts, Stripe, and release gates

Authentication and billing exist in the commercialization branch but are not activated by the rebrand.

- Attach `firmquarry.com` to the correct Vercel production project, verify HTTPS and DNS, **then** set `NEXT_PUBLIC_APP_URL=https://firmquarry.com`.
- Update authorized callback URLs at the selected OAuth providers (`https://firmquarry.com/api/auth/callback/google` and/or `github`), configure `AUTH_SECRET`, keys and `AUTH_ENABLED=true`, and test with the real database.
- Configure signed Stripe webhook `https://firmquarry.com/api/billing/webhook` and the required plan price IDs. Keep `BILLING_ENABLED=false` until checkout, entitlements, cancellations and legal/tax items are reviewed.
- Do not use development mock modes in production.
- Resolve the known Next.js 16.4.2 security issue and verify the Neon database before production promotion.
- This work stacks on PR #6, which stacks on PR #5. Merge and test in dependency order, and do not auto-promote this draft PR to Production.
- Redirect the old site with permanent redirects only after the new domain and routes function and canonical URLs/search indexes are reviewed.

## Release verification

1. Root home is public, shows honest sign-in availability and linked plan pricing.
2. Research overview is at `/workspace`, with market filters preserving that path.
3. Sidebar shows My Account immediately above Help & Feedback; never Plans.
4. `/support` is centered and opens a usable draft when the automated service is absent; live form works when configured.
5. `/admin` no longer exists.
6. `/pricing` and `/sign-in` use public navigation with paths back to research.
7. All customer-facing pages say FirmQuarry; original brand isn't displayed.
8. Real sign-in and payments work only after production configuration and verification.
9. Public website, search metadata, canonical URL and robots/sitemap all use `firmquarry.com`.
10. CI unit tests, typecheck and production build pass before release.
