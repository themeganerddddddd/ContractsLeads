# Preview database connection and live-data recovery

## Why the preview shows no company data
The `platform/web` application reads company and contract intelligence from PostgreSQL through server-only `DATABASE_URL`. Vercel Preview deployments **do not automatically inherit Production environment variables**. The current deploy can build successfully without a database URL because most data access occurs at request time. A successful Vercel build is **not** evidence that data queries work.

The new read-only status endpoint `/api/status/public` returns safe status categories:
- `unconfigured`: no `DATABASE_URL` in the running deployment.
- `unreachable`: connection or runtime configuration failed.
- `schema_missing`: PostgreSQL connected, but core migrations are missing.
- `empty`: core tables exist, but there are no real federal awards.
- `ready`: the core company/awards tables exist and real award records are present (other intelligence sources may still be missing).

No secret values, connection strings, SQL exceptions, or private database names are emitted from this endpoint.

## Restoring the full company intelligence application

1. **Confirm ownership and access.** The app is deployed from repository `themeganerddddddd/ContractsLeads` with Next.js root `platform/web`, under Vercel project `west-tech/federal-ledger`. A Vercel connector that cannot list that project cannot update the environment on your behalf; restore project access there before attempting an automated fix.
2. **Choose a safe Preview database.** Prefer a separate Preview Neon branch or an isolated PostgreSQL clone of the production schema and permitted public-source data. Do **not** put a production direct/admin connection string in Preview. Avoid pointing unreviewed branch code at writable production.
3. **Configure Vercel → federal-ledger → Settings → Environment Variables.** Add `DATABASE_URL` as a server-only, pooled Postgres URL, scoped to **Preview** (ideally restricted to `feature/company-intelligence-studio-v2` or its associated Preview environment). Do not prefix it with `NEXT_PUBLIC_` and do not commit it.
4. **Supply preview runtime configuration.** The existing `validateRuntimeConfig()` is fail-closed under Next.js production mode, including Preview, and also requires `NEXT_PUBLIC_APP_URL`, `AUTH_SECRET`, `INTERNAL_HEALTH_TOKEN`, explicit `AUTH_ENABLED=false` and `BILLING_ENABLED=false` for a publicly readable, no-checkout Preview. Use unique Preview secrets. Set `APP_ENV=preview`; do not set `DEV_AUTH`, `DEV_STRIPE`, `DEV_PLAN` or the unsafe mock override. `NEXT_PUBLIC_APP_URL` should match the actual Preview's HTTPS origin.
5. **Prepare the database independently of Vercel.** Apply additive migrations in the isolated Preview database using `python platform/scripts/manage_db.py migrate` with `PLATFORM_DATABASE_DIRECT_URL` supplied securely to the migration runner. Do not configure the direct connection string in Vercel's web runtime. Back up first if reusing an existing database. Confirm tables and realistic source coverage. A schema-only clone will display empty-state results.
6. **Populate official data.** Run bounded importers on the Preview clone and validate counts, company identity, geography and source provenance; then schedule supported jobs once tested. Don't insert fictional seed data into public profiles.
7. **Redeploy the branch** after changing Vercel env vars; existing deployments keep their captured env snapshot. Verify `/api/status/public` returns HTTP 200 with `status: ready`, then validate `/companies`, one `/company/[slug]`, its `/contracts` archive, and all three radars against real public-source records. The status endpoint intentionally does not claim all movement sources are complete.
8. **Production remains separate.** Do not merge or promote until Preview data connectivity, safe access, migration compatibility and smoke tests pass.

## Degraded public-source functionality
Even if the preview database is not connected, the homepage and `/contracts` have a bounded, read-only USAspending.gov federal awards view. It requests official records directly on the server, caches responses for 15 minutes, and links to the original source. It **cannot** reconstruct the proprietary company's change history, verified locations, full transaction ledger, or valid expansion/retention probabilities. Those capabilities still require a populated database.

If the upstream API fails or returns an unexpected format, the UI reports the unavailable source instead of substituting fake data.
