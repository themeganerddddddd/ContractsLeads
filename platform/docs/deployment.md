# Federal Ledger production deployment

This repository is the source of truth for the production application.

## GitHub and Vercel project settings

- Git repository: `themeganerddddddd/ContractsLeads`
- Production branch: `main`
- Vercel team: `WestTech`
- Vercel project: `federal-ledger`
- Framework preset: Next.js
- Root Directory: `platform/web`

Use Vercel's standard Git integration. Pull requests and non-production branches create previews; a tested push to `main` creates the production deployment. No `vercel.json` is required.

## Environment separation

Vercel receives the pooled web connection only:

```text
APP_ENV
DATABASE_URL
DATABASE_POOL_MAX
NEXT_PUBLIC_APP_URL
AUTH_SECRET
AUTH_ENABLED
AUTH_GITHUB_ID
AUTH_GITHUB_SECRET
BILLING_ENABLED
INTERNAL_HEALTH_TOKEN
DEV_AUTH
DEV_STRIPE
```

Set `APP_ENV=production`, `DEV_AUTH=false`, and `DEV_STRIPE=false` in Production. Do not configure `DEV_PLAN` in Vercel. Development auth, billing, and plan overrides are rejected at production runtime unless the separately named `ALLOW_UNSAFE_PRODUCTION_MOCKS=true` emergency override is deliberately enabled. Keep that override unset during normal operation.

Set `AUTH_ENABLED=false` for the anonymous public beta. Public search and profile
pages remain available, while account APIs return their existing unauthenticated
responses and no development user is created. To enable GitHub sign-in later, set
`AUTH_ENABLED=true`, configure both GitHub OAuth variables, and register the callback:

```text
<NEXT_PUBLIC_APP_URL>/api/auth/callback/github
```

Auth.js post-login redirects are constrained to the configured public application origin.

When `BILLING_ENABLED=false`, Stripe is not required and checkout/portal endpoints return a controlled unavailable response. When `BILLING_ENABLED=true`, also configure these Vercel Secret variables:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_LOCAL_MONTHLY
STRIPE_PRICE_LOCAL_ANNUAL
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_PRO_ANNUAL
STRIPE_PRICE_ANALYST_MONTHLY
```

`PLATFORM_DATABASE_DIRECT_URL` is deliberately excluded from Vercel. Configure it only as the GitHub Actions secret used by migrations and workers. `SAM_API_KEY` remains an optional secret for the legacy Montgomery County collector.

Never prefix database, Auth.js, Stripe, or health credentials with `NEXT_PUBLIC_`.

## Release order

1. Provision managed PostgreSQL with pooled and direct connection strings.
2. Add `PLATFORM_DATABASE_DIRECT_URL` to GitHub Actions secrets.
3. Apply forward-only migrations from the repository root:

   ```powershell
   $env:PLATFORM_DATABASE_DIRECT_URL = "<direct managed PostgreSQL URL>"
   python platform/scripts/manage_db.py migrate
   ```

4. Verify the schema and data-health query.
5. Connect the Git repository to Vercel with `platform/web` as Root Directory.
6. Add the Vercel variables above, using `DATABASE_URL` for the pooled connection.
7. Deploy a preview, smoke-test it, then promote or merge the tested commit to `main`.
8. Run bounded ingestion before starting the manual historical backfill.

Migrations are never run by `next build` or page requests. Docker is local-development infrastructure only.

## Worker commands

Run these from `platform/` with `PLATFORM_DATABASE_DIRECT_URL` configured:

```powershell
# Daily U.S. incremental sync
python -m ingestion sync

# Explicit bounded U.S. validation window
python -m ingestion sync --start 2026-10-19 --end 2026-10-19 --limit 100

# Weekly U.S. reconciliation
python -m ingestion reconcile --days 30

# Manual FY2022-present historical backfill (restart-safe and idempotent)
python -m ingestion backfill --start 2021-10-01 --end 2026-10-20 --batch-size 1000

# Independent UK Find a Tender sync
python -m ingestion uk-sync

# Versioned model backtests/training
python -m intelligence backtest --type new_award
python -m intelligence backtest --type contract_change

# Append-only predictions and descriptive momentum
python -m intelligence predict --type new_award --horizons 30,60,90
python -m intelligence predict --type contract_change --horizons 30,60,90
python -m intelligence momentum
```

Historical U.S. lifecycle events are reconstructed by migration `0006_us_lifecycle_backfill.sql`; subsequent U.S. and UK ingestion generates events during the worker transaction. Event generation never runs inside the frontend.

Probabilities remain null in the UI unless the persisted model version passes the documented history, sample-size, discrimination, and calibration gates.

## Required GitHub Actions secrets

```text
PLATFORM_DATABASE_DIRECT_URL
```

Optional legacy collector secret:

```text
SAM_API_KEY
```

Do not store Vercel credentials in GitHub when using the standard Vercel Git integration.
