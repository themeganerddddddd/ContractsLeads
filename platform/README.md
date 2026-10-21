# Federal Ledger platform

`platform/` is an isolated, database-backed national contract-intelligence application built from the concepts proven by the Montgomery County tracker. The original `site/`, `data/`, `collectors/`, `pipeline/`, and workflows remain unchanged and deployable.

Phase 2 hardens the V1 product for a production beta without redesigning the interface. The current global foundation adds source-neutral procurement processes, append-only lifecycle events, conservative international entity identity, the official UK Find a Tender OCDS adapter, and explainable point-in-time intelligence with calibration gates.

The platform deliberately separates two questions throughout its schema, importer, query service, URLs, and UI:

- **Where is the company based?** Company/recipient fields live on `companies.recipient_*`.
- **Where is the work performed?** Award fields live on `awards.performance_*`.

The application never promotes a place of performance into a company address. Disclosed transaction obligations, current contract value, and potential contract value are distinct nullable fields.

## Architecture

```text
USAspending full fiscal-year archives → restart-safe historical bootstrap
USAspending transaction API          → daily changed rows + weekly reconciliation
UK Find a Tender OCDS release API     → cursor-based current and historical windows
        ↓ streamed parsing, batch-atomic upserts, raw source retention
Country source adapters + Python ingestion service
        ↓ companies / awards / transactions / global processes + lifecycle evidence
PostgreSQL
        ↓ point-in-time features, versioned models, append-only predictions
Transparent logistic models + Government Momentum index
        ↓ server-side SQL, filters, pagination, entitlements
Next.js server components / route handlers
        ↓
Public profiles, search, CSV export, saved-search and billing boundaries
```

Production deployment is intentionally split:

- **Next.js web:** Vercel Functions/server components.
- **PostgreSQL:** any managed PostgreSQL provider with connection pooling; Neon is a natural Vercel option.
- **Ingestion:** a scheduled worker or GitHub Actions, never a page request.
- **Authentication:** Auth.js with GitHub OAuth when configured; a clearly identified development user locally.
- **Billing:** Stripe checkout, portal, and idempotent webhook handlers; mock redirects locally.

## Directory structure

```text
platform/
  db/                 PostgreSQL migration, schema entry point, demo seed
  ingestion/          Nationwide transaction importer and CLI
  intelligence/       Point-in-time features, backtests, predictions, momentum
  scripts/            Migration, scale-data, and EXPLAIN ANALYZE utilities
  docs/               Production operations, backup, and restore runbook
  shared/             Industry taxonomy and plan entitlements
  tests/              Offline ingestion/domain tests
  web/                Next.js application and web tests
  docker-compose.yml  Local PostgreSQL
  .env.example        Credential-free configuration template
```

## Local setup

Prerequisites: Docker Desktop, Python 3.11+, Node.js 20.9+.

From the repository root:

```powershell
cd platform
Copy-Item .env.example .env
docker compose up -d
python -m pip install -r requirements.txt
python scripts/manage_db.py migrate
python scripts/manage_db.py seed

cd web
npm install
npm run dev
```

On macOS/Linux, replace `Copy-Item .env.example .env` with `cp .env.example .env`.

Open `http://localhost:3000`. The Next.js config loads `platform/.env`; no duplicate web environment file is required. The seed is idempotent and contains only clearly labeled fictional demonstration records. It includes local→local, local→outside, outside→local, and outside→outside relationships.

Stop local infrastructure with:

```powershell
cd platform
docker compose down
```

The named Docker volume preserves database data. Use `docker compose down -v` only when you intentionally want to delete the local database.

## Database and migrations

Apply all pending migrations:

```powershell
cd platform
python scripts/manage_db.py migrate
```

Load or refresh demo data:

```powershell
python scripts/manage_db.py seed
python scripts/manage_db.py reset-demo
```

`db/schema.sql` is a `psql` convenience entry point. `scripts/manage_db.py` is the cross-platform migration runner and records applied files in `schema_migrations`.

The schema includes the original U.S. tables plus reviewed organizations, source-specific entity identifiers, buyers, procurement processes and suppliers, append-only releases and lifecycle events, CPV mappings, source coverage, versioned models, append-only predictions, momentum snapshots, and company watches. PostgreSQL trigram/full-text and composite geography/date/entity indexes support server-side search and profiles. Transaction-based annual views prevent an award's lifetime obligation from being repeated across years.

## Ingestion

The daily importer uses USAspending's transaction search endpoint with `date_type=last_modified_date`. It reads the latest successful checkpoint, subtracts `INGESTION_OVERLAP_DAYS`, and upserts every returned transaction. A failed or partial run does not become the next successful checkpoint.

```powershell
cd platform
python -m ingestion sync
python -m ingestion sync --start 2026-10-19 --end 2026-10-19 --limit 100
```

Periodic recent-history reconciliation queries by action date and reuses the same idempotent upserts:

```powershell
python -m ingestion reconcile --days 30
python -m ingestion reconcile --start 2022-01-02 --end 2022-01-02
```

The default window comes from `RECONCILIATION_DAYS`. Recommended production schedule:

- daily: `python -m ingestion sync`
- weekly: `python -m ingestion reconcile --days 30`
- occasional wider reconciliation after upstream corrections

Historical bootstrap discovers the latest official full All Agencies Contracts archive for every fiscal year intersecting the requested action-date range:

```powershell
python -m ingestion backfill --start 2021-10-01 --end 2022-09-30 --batch-size 1000
```

To request the complete Phase 2 target through the current federal fiscal year, use the full window below. The importer still processes and checkpoints each discovered fiscal-year archive independently:

```powershell
python -m ingestion backfill --start 2021-10-01 --end 2026-10-13 --batch-size 1000
```

The downloader resumes partial ZIP files with HTTP Range requests. ZIP members and CSV rows stream without loading the archive into memory. Each database batch and its member/row checkpoint commit atomically; rerunning the same command is safe, and a completed job becomes a no-op. For simpler capacity management, run one fiscal year at a time in production. Provision cache space for the compressed archive plus database/WAL growth: individual official full archives can be multiple gigabytes. A bounded validation is available with `--source-file` and `--max-records`; bounded jobs are explicitly `partial`, never complete.

The importer does not query every known company. It retrieves changed contract transactions nationally, preserves source transaction IDs and raw JSON, resolves recipients UEI-first, and then upserts the awarded legal entity, award, and transaction. Individual malformed records are counted and logged without discarding successful records. Source/API failures return a non-zero exit status.

USAspending does not expose every award-level ceiling/current value on every row. Missing current or potential values remain null. `total_obligated` is the sum of the disclosed transactions actually present for the award; it remains null when no transaction obligation is disclosed. Raw source rows and observation tables retain the evidence needed to diagnose later source changes.

### UK and global sources

Import official Find a Tender OCDS releases for the default overlap or an explicit historical window:

```powershell
python -m ingestion uk-sync
python -m ingestion uk-sync --start 2025-01-01 --end 2025-01-31 --limit 100
```

Releases are grouped by OCID and deduplicated by release ID plus payload hash. Native GBP is preserved; USD is absent without complete FX evidence. See [docs/international-procurement.md](docs/international-procurement.md).

### Predictions and momentum

```powershell
python -m intelligence backtest --type new_award
python -m intelligence backtest --type contract_change
python -m intelligence predict --type new_award --horizons 30,60,90
python -m intelligence predict --type contract_change --horizons 30,60,90
python -m intelligence momentum
```

The UI and `/admin/models` withhold probabilities unless the out-of-time model passes minimum history, sample, discrimination, and Brier-score gates. Government Momentum is explicitly a 0–100 activity index, not a probability. See [docs/predictive-intelligence.md](docs/predictive-intelligence.md).

## Data quality and validation

Generate the database-backed duplicate, geography, award/transaction, and industry audit:

```powershell
python -m ingestion qa --output-dir reports
```

The report includes UEI and conservative no-UEI duplicate checks, similar-name/different-UEI review candidates, contradictory recipient geography observations, state/county FIPS consistency, PIID identity conflicts, awards without transactions, obligation reconciliation, industry distribution, and high-volume unmapped NAICS/PSC combinations. Review candidates are not auto-merged.

Validate representative production markets and compare them directly with USAspending:

```powershell
python -m ingestion validate-markets --start 2022-10-01 --end 2023-09-30 --output-dir reports
```

This reports company, award, transaction, and disclosed-obligation metrics plus top companies, agencies, and industries for Montgomery County, MD; Orleans Parish, LA; Madison County, AL; and representative Northern Virginia jurisdictions. Recipient and performance metrics are separate. Differences are flags for investigation because source snapshot timing or incomplete local coverage can also explain them.

## Web application

```powershell
cd platform/web
npm install
npm run dev
```

All public pages are server-rendered. Search filters and pagination live in the URL, and PostgreSQL performs filtering, ordering, counting, and pagination. The browser never downloads a national JSON archive.

Key routes:

- `/search?mode=companies` and `/search?mode=contracts`
- `/company/[slug]`
- `/contract/[id]`
- `/process/[id]`
- `/admin/models`
- `/location/[state]/[county-fips]`
- `/agency/[slug]`
- `/industry/[slug]`
- `/pricing`
- `/saved-searches`
- `/api/export` and internal search/profile service boundaries
- `/api/health/data` authenticated ingestion/data health JSON

The sitemap contains canonical entity, award, agency, industry, and location pages. Arbitrary filtered-search combinations are excluded from indexing.

## Plans and entitlements

All capabilities are defined in `shared/entitlements.json` and read through `web/lib/entitlements.ts`. Application code asks `can(plan, capability)`; it does not scatter plan-name checks through features.

Set one of these in `platform/.env`, then restart the dev server:

```text
DEV_PLAN=free
DEV_PLAN=local
DEV_PLAN=pro
DEV_PLAN=analyst
```

Free and Local users can see performance-location and intelligence controls, but full place-of-performance results and prediction/momentum filtering require Pro. History and total visible results are clamped server-side. Export, watches, and monthly row use are also enforced server-side.

## Authentication development mode

`DEV_AUTH=true` supplies a local development user and never stores a password. Production uses Auth.js. Configure:

```text
DEV_AUTH=false
AUTH_ENABLED=true
AUTH_SECRET=<strong-random-secret>
AUTH_GITHUB_ID=<oauth-client-id>
AUTH_GITHUB_SECRET=<oauth-client-secret>
```

No authentication credential is required for local development. Do not use the development fallback in production.

## Stripe development mode

`DEV_STRIPE=true` makes checkout and portal handlers return local mock redirects. For live Stripe integration, set `DEV_STRIPE=false`, configure the server-only secret and webhook secret, and create the price IDs listed in `.env.example`.

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_LOCAL_MONTHLY=
STRIPE_PRICE_LOCAL_ANNUAL=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_ANNUAL=
STRIPE_PRICE_ANALYST_MONTHLY=
```

The secret key is imported only by server modules. Webhook event IDs are inserted into `stripe_events` inside the same transaction as subscription synchronization, making retries idempotent.

## Saved searches and alerts

Saved searches store structured JSON, not SQL. The API supports create, list, rename, and delete, and the UI can rerun them. `alert_frequency` supports `none`, `weekly`, and `daily`; delivery is intentionally a worker stub in this V1. Local and Pro plan checks are enforced before writes.

## CSV exports

`GET /api/export` reuses the contract search service and the current URL filters. CSV is built on the server, returned as an attachment, and recorded in `exports`. Permission and monthly row limits are checked before output. XLSX is reserved in the Analyst entitlement model but is not generated in this V1.

## Tests

Run the original tracker and platform Python tests together from the repository root:

```powershell
python -m pytest
```

Run web unit tests and a production build:

```powershell
cd platform/web
npm test
npm run typecheck
npm run build
```

The default test suite is offline; it does not depend on live federal APIs. When a migrated PostgreSQL URL is present, aggregate integration tests verify transaction-based annual sums, pagination-independent totals, and separate recipient/performance geography. Platform CI starts PostgreSQL, applies migrations, seeds data, runs Python/web tests and type checking, and verifies the production build.

## Environment variables

See `.env.example` for the complete credential-free template. Locally, `DATABASE_URL` and `PLATFORM_DATABASE_DIRECT_URL` use the same Docker database. In production, `DATABASE_URL` must be the provider's pooled web URL and `PLATFORM_DATABASE_DIRECT_URL` the worker/migration URL. USAspending requires no key. Secrets belong in `.env.local`, CI secrets, or Vercel Secret variables—not tracked files.

`APP_ENV=production` enables fail-closed validation, and the same safeguards also activate whenever Node runs in production mode. Production requires the pooled database, public URL, Auth.js secret, explicit `AUTH_ENABLED`, and internal-health credentials. `AUTH_ENABLED=false` supports an anonymous public beta without OAuth credentials; enabling it requires both GitHub OAuth variables. Set `BILLING_ENABLED=false` for the first beta when Stripe is not live; Stripe credentials, price IDs, and webhook secret become mandatory only when `BILLING_ENABLED=true`. `DEV_AUTH` and `DEV_STRIPE` are exact opt-ins and are rejected in production unless `ALLOW_UNSAFE_PRODUCTION_MOCKS=true` is deliberately used for an emergency. A normal deployment must leave that override unset.

## Deployment

1. Provision managed PostgreSQL with point-in-time recovery; apply migrations through the direct URL before web promotion.
2. Deploy `platform/web` as the Vercel project root and configure `APP_ENV=production`, the pooled `DATABASE_URL`, `DATABASE_POOL_MAX`, and `NEXT_PUBLIC_APP_URL`.
3. Configure Auth.js and `INTERNAL_HEALTH_TOKEN` as Vercel Secret variables scoped separately for production and preview. Configure Stripe variables only when `BILLING_ENABLED=true`.
4. Configure `PLATFORM_DATABASE_DIRECT_URL` as the GitHub Actions secret for daily, weekly, and manual backfill workers.
5. Keep database and Vercel Function regions close, run the historical backfill one fiscal year at a time, and validate each completed year.

The exact GitHub/Vercel setup and worker commands are in [docs/deployment.md](docs/deployment.md). The operations runbook, including restore drills, is [docs/operations.md](docs/operations.md).

## Scale and query plans

Scale data is generated directly into local PostgreSQL, never committed as a huge fixture. It is marked `is_demo` and `is_benchmark`, excluded by public queries, and blocked when `APP_ENV=production`:

```powershell
$env:ALLOW_BENCHMARK_DATA="true"
python scripts/generate_scale_data.py generate --rows 100000
python scripts/benchmark_queries.py --output-dir reports
python scripts/generate_scale_data.py clean
```

The benchmark records real `EXPLAIN ANALYZE` execution/planning times, buffer use, and indexes for 13 major page/query shapes. Numbers are environment-specific; only generated reports from an actual run should be quoted.

## Known limitations

- The seed is fictional and intentionally small; it demonstrates behavior, not federal facts. Benchmark rows are also synthetic, clearly marked, and excluded from public queries.
- Alert delivery and scheduled exports have schema/UI boundaries but no email worker yet.
- XLSX output, public paid API keys, custom-region editing, and team administration are architectural placeholders.
- The transaction-search response does not consistently include all award ceiling/current values; nulls are preserved.
- Company name fallback is exact and conservative. Automated parent-family resolution is not attempted without identifiers.
- County names/FIPS are normalized from source location objects; no external geocoder is bundled.
- A complete FY2022-present historical load is intentionally not claimed by this repository. Official full archives are multi-gigabyte and must be executed against the production database/worker; this environment validates the resumable pipeline with bounded fixtures.
- The local official snapshot covers one action date, so it cannot support a legitimate temporal prediction backtest. Model versions record `insufficient_history` and probabilities remain null until a multi-year official load passes the documented gate.
- Find a Tender is the first international source. Other countries require their own official adapter, identity tests, and coverage review; cross-country name-only company or organization merges are prohibited.
- USD comparison for non-USD records is intentionally absent until a dated, source-linked FX adapter is added.
- The current correction strategy upserts later search/full-archive versions and preserves their source history, but does not delete a local transaction merely because it disappears from a newer full archive. Source-side deletion/tombstone handling remains an operations review item before declaring the database a perfect mirror.
- Alert delivery, XLSX generation, paid public API keys, custom-region editing, and team administration remain outside Phase 2 priority.
