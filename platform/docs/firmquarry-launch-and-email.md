# FirmQuarry rebrand, support inbox, and safe launch checklist

## Actual DNS setup — Nov 17, 2026

The domain `firmquarry.com` is registered in the Vercel `west-tech` team. Its Vercel DNS was verified with no prior MX records. The following two MX records have been added to the root without changing web-hosting records:

- MX priority 0, `mx1.forwardemail.net`
- MX priority 0, `mx2.forwardemail.net`

**DNS forwarding configuration installed:** The founder generated an encrypted `forward-email=` value, and that exact root TXT record was added to the Vercel DNS zone. Vercel DNS reads confirm both MX records and the encrypted TXT exist; no other MX record conflicts. **Live forwarding/delivery has not yet been tested.** Test by sending to `support@firmquarry.com` from an independent email account and confirming receipt in the intended Gmail inbox. Do not commit or display the private recipient or encrypted TXT value in repository files. After verification, set `NEXT_PUBLIC_SUPPORT_EMAIL=support@firmquarry.com` in Vercel Production when the site is ready. Outbound messages/replies from a branded address require separately configured SMTP or mailbox.


**Domain owned by founder:** `firmquarry.com`  
**Public product brand:** FirmQuarry  
**Contact address to activate:** `support@firmquarry.com` (do not display until it receives mail)

## 1. Receive mail without publishing a personal Gmail address

Recommended low-cost approach: **route `support@firmquarry.com` to an existing Gmail inbox**.
Check whether the domain's current DNS host/registrar offers email forwarding first.
If using Cloudflare Email Routing, the domain's authoritative nameservers must be at
Cloudflare: import/verify existing website DNS records *before changing nameservers*,
then open Cloudflare dashboard → Email Routing, verify the Gmail destination, and
create the `support@` routing rule. Test from a second inbox and verify delivery.

Forwarding is **receiving only**. Replies typed in ordinary Gmail will otherwise be
sent from the personal Gmail account, revealing it to customers. To reply from
`support@firmquarry.com`, use a real custom-domain mailbox (e.g. Google Workspace,
Zoho Mail) or configure Gmail's "Send mail as" with a **legitimate SMTP provider**
that authenticates the domain. Do not rely on Gmail's own mail servers to spoof the
domain; verify SPF, DKIM, and DMARC. Avoid combining competing apex MX records
from different mailbox providers.

Configure this public variable after receiving test succeeds:
```
NEXT_PUBLIC_SUPPORT_EMAIL=support@firmquarry.com
```
Set optional sales address only once its inbox/forwarding is tested:
```
NEXT_PUBLIC_SALES_EMAIL=hello@firmquarry.com
```

## 2. Enable the Help & feedback form

The site includes a dedicated `/support` page plus a persistent help launcher.
The web form is **disabled until all** five server-side/client config values are set
and deployed. This is deliberate: the UI must not claim a message was sent when
email or anti-spam delivery isn't ready.

- Create an account on Resend (or compatible sending API); verify a **sending
  subdomain** such as `notify.firmquarry.com`. This avoids clashes with
  Cloudflare's **incoming** mail MX records on `firmquarry.com`.
- Add provider-provided DKIM/SPF/TXT records for the sending subdomain.
- Create a Cloudflare Turnstile site for `firmquarry.com`; get its site and secret keys.
- Configure Vercel environment variables **server-side**:
  ```
  SUPPORT_INBOX_EMAIL=<private Gmail destination or tested support inbox>
  RESEND_FROM_EMAIL=FirmQuarry <feedback@notify.firmquarry.com>
  RESEND_API_KEY=<secret>
  TURNSTILE_SECRET_KEY=<secret>
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=<public key>
  ```
- Redeploy so the values take effect. Submit a genuine feedback message, confirm it
  arrives, and reply to it using the real firmquarry.com identity.
- The form currently sends messages to email, **not a database support inbox**.
  Keep feedback in the email inbox and add ticket persistence later if needed.

The server validates same-origin POST, field sizes, categories, honeypot, and
Cloudflare Turnstile before sending via Resend. It never exposes secrets to clients.

## 3. Accounts, billing, and owner dashboard

Existing Auth.js Google/GitHub sign-in and Stripe subscriptions come from the
stacked commercialization branch, not this rebrand. They are **not activated by
renaming the UI**.

- Set `NEXT_PUBLIC_APP_URL=https://firmquarry.com` in the **Production**
  environment **only when domain DNS and Vercel project association are ready**.
  This controls metadata, sitemap, redirects, and Stripe checkout URLs.
- Update Google/GitHub OAuth authorized callback URIs for the new host, including
  `https://firmquarry.com/api/auth/callback/google` or `/github` as appropriate.
- Configure `AUTH_ENABLED=true`, provider secrets, and `AUTH_SECRET` only after
  testing with a live database. Never use DEV_AUTH/DEV_STRIPE in production.
- After verifying checkout/webhooks and legal/tax review, configure Stripe's
  **signed webhook endpoint** `https://firmquarry.com/api/billing/webhook`,
  all required Stripe price IDs and `BILLING_ENABLED=true`. Keep billing off
  until then.
- To enable `/admin`, set `OWNER_EMAIL` to the **exact email** used by your Google
  or GitHub login; the page is inaccessible without a genuine authenticated
  owner session. It shows real account/subscription counts only when the database
  is connected; Stripe remains the actual source of truth for revenue.
- If the database is disconnected, admin shows an unavailable notice, never zero.
  Feedback messages are emailed, so they are not counted in admin yet.

## 4. Production release gate

This branch builds upon **PR #6**, itself based on **PR #5**. Before changing
Production, resolve the known Next.js 16.4.2 security issue, restore/verify
Neon, validate Auth/Stripe, run tests, and review legal terms/privacy. PR #5 then
PR #6 must be merged in order; review the FirmQuarry branch afterward.

Do **not** silently redirect the old site until the new site works. Once both
domains are verifiably controlled, attach `firmquarry.com` to Vercel Production,
verify DNS and HTTPS, test the launch and then add a permanent 301 redirect from
the old primary domain. Never point a domain you do not control to the project.

Update third-party URLs (Google Search Console, Stripe, Google OAuth,
sitemaps, external marketing profiles) to `firmquarry.com`.

## 5. Checks after production configuration

1. Open `https://firmquarry.com`; header, footer, titles and OG metadata say FirmQuarry.
2. `/robots.txt` and `/sitemap.xml` have firmquarry.com URLs.
3. A visitor without a login can use the free tier.
4. A real customer can sign in, buy, see entitlement, manage billing and cancel.
5. Support button works from all pages and sends verified feedback to the owner.
6. Owner login can access `/admin`; other visitors receive 404.
7. Stripe Dashboard payment totals agree with database entitlements.
8. Previous-domain redirects retain path and don't produce canonical duplicates.
