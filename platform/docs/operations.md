# Federal Ledger production operations

## Data-source and amount methodology

Historical bootstrap uses the latest official USAspending **full All Agencies Contracts archive** for each federal fiscal year intersecting the requested action-date window. Archives are discovered through `POST /api/v2/bulk_download/list_monthly_files/`; the pipeline does not hard-code dated file URLs. ZIP files download to `BACKFILL_CACHE_DIR` with HTTP Range resume, stay compressed on disk, and are read one CSV row at a time.

Source transaction IDs are the idempotency key. Bulk rows use USAspending's `contract_transaction_unique_key`. The transaction-search endpoint's `internal_id` is an award surrogate shared by modifications, so contract search rows use a deterministic award-identity plus modification-number fingerprint; a fuller action fingerprint is used only when modification number is absent. Amount and description are deliberately excluded from the normal key so corrections update the same transaction. The importer retains each raw source row, keeps awards and transactions separate, and recomputes `awards.total_obligated` from all disclosed transaction obligations loaded for that award. It does not infer a missing amount, ceiling, address, UEI, or geography. Transaction action dates drive historical windows and annual views. Recipient geography answers where the awarded entity is based; performance geography answers where the work is reported as performed.

The initial archive is a point-in-time snapshot. Daily `last_modified_date` ingestion and weekly action-date reconciliation capture later changes. Reimporting a newer full archive is safe because all source transactions are upserted. The all-years delta archive is not used as the sole bootstrap source: full fiscal-year archives are more auditable and avoid relying on a delta to represent complete history.

## Backfill runbook

Apply migrations before any worker runs:

```powershell
cd platform
python scripts/manage_db.py migrate
```

Configure the provider's current project storage ceiling and inspect the live
database before every historical operation:

```powershell
$env:DATABASE_CAPACITY_BYTES="1000000000" # verified 1 GB project allowance; re-check provider terms before changing
python -m operations storage-report
```

Historical loaders fail closed when `DATABASE_CAPACITY_BYTES` is absent. They
record a capacity observation before download and before every major batch,
warn at 60%, and stop cleanly at 72% by default. Committed chunks remain
restartable. Daily feeds use the separate 90% critical threshold. Thresholds
are environment configuration, not assumptions embedded in application code.
TED monthly packages are streamed as `.tar.gz` files and can be hundreds of
megabytes (recent observed packages were roughly 334–382 MB). Set
`BACKFILL_MAX_DOWNLOAD_BYTES` to the runner's verified scratch-disk allowance;
the downloader checks `Content-Length` before transfer and resumes partial files.

Run one fiscal year at a time so the downloaded file, database load, and validation are independently recoverable:

```powershell
python -m ingestion backfill --start 2021-10-01 --end 2022-09-30 --batch-size 1000
```

Do not issue a multi-year request until measured sample growth and conservative
projection show that it fits below the stop threshold. If it does, the
equivalent request is:

```powershell
python -m ingestion backfill --start 2021-10-01 --end 2026-10-20 --batch-size 1000
```

Repeat for subsequent fiscal years through the current date. The current checkpoint is stored in `backfill_jobs` only in the same database commit as the corresponding data batch. After a process or network failure, run the identical command; the partial archive download and CSV checkpoint are resumed. A job marked `success` is a no-op on rerun. Do not change the date window during a resume.

Capacity-plan `BACKFILL_CACHE_DIR` for at least one compressed full-year archive at a time plus database and WAL growth; official archives can be multiple gigabytes. The production database also retains append-only raw payload versions, which are frequently the dominant storage category. Prefer compressed raw-source archives in object storage with hashes and database pointers once that tier is provisioned; do not silently delete database history. The importer upserts observed corrections and retains append-only source versions. It deliberately does not infer that a transaction was deleted solely because it is absent from a later full archive, so investigate upstream deletions/tombstones separately before treating the local database as an exact deletion mirror.

## Raw archive retention and feature exports

Migration `0016_businesscurrent_retention.sql` adds manifests, row pointers,
retention policies, national coverage status, monthly permanent features, and
feature-export manifests. It does not move, replace, prune, or delete production
payloads when applied.

Read the archive plan before every write:

```powershell
python -m operations retention-plan --as-of 2026-10-30
```

A bounded archive run requires an explicit acknowledgement. The worker writes
deterministic gzip JSONL, independently reads the object back, verifies SHA-256,
and only then commits the manifest. It never prunes PostgreSQL:

```powershell
python -m operations retention-archive --source usaspending_transaction_versions --limit 1000 --execute
```

Use `--local-root` only for development/prototype archives. Production uses an
S3-compatible client configured through `ARCHIVE_S3_BUCKET`, optional endpoint,
region, and prefix values; credentials remain in the provider SDK environment
and never enter a manifest or log.

Annual Parquet feature exports are separate from raw retention. Planning is
read-only; exporting requires both `--execute` and the optional PyArrow package:

```powershell
python -m operations feature-export-plan --dataset company_monthly_features --year 2026
python -m operations feature-export --dataset company_monthly_features --year 2026 --execute
```

The exporter keeps every PostgreSQL feature row, verifies the uploaded Parquet
checksum, and records an additive manifest. There is no warehouse dependency.

For a bounded production-like validation using an official-format local file:

```powershell
python -m ingestion backfill --start 2022-01-01 --end 2022-01-31 --source-file C:\path\contracts.zip --max-records 10000
```

`--max-records` deliberately leaves the job `partial`; it is not evidence of complete coverage. Remove the option and rerun to continue from the checkpoint.

After each fiscal year:

```powershell
python -m ingestion qa --output-dir reports
python -m ingestion validate-markets --start 2021-10-01 --end 2022-09-30 --output-dir reports
```

Golden-market comparison queries USAspending transactions directly for Montgomery County, MD; Orleans Parish, LA; Madison County, AL; and a representative Northern Virginia county/city set. It counts distinct awards from those transactions rather than using USAspending's overlapping-award count, which has different date semantics. Source windows above 50,000 transactions must be split. Flags are investigation prompts: incomplete local coverage and source snapshot timing can differ without an application defect. Use `--offline` only when network comparison is intentionally unavailable.

## Schedules and failure handling

- `.github/workflows/platform-ingestion.yml`: daily changed-transaction sync.
- `.github/workflows/platform-reconciliation.yml`: weekly 30-day action-date reconciliation, with a validated manual window.
- `.github/workflows/platform-backfill.yml`: manual historical window, serialized with other ingestion.
- `.github/workflows/platform-global-intelligence.yml`: UK daily sync and then U.S.-only model audit.
- `.github/workflows/platform-eu-ted.yml`: TED daily Search API sync or manual capacity-governed monthly XML package.

All workers use `PLATFORM_DATABASE_DIRECT_URL`. The web application uses a provider-pooled `DATABASE_URL`. The workflows serialize through one concurrency group so a reconciliation cannot advance alongside a historical batch. Partial and failed ingestion runs never become the daily successful checkpoint. Structured logs include run/job ID, event, window, counts, duration, and exception type; they exclude environment values and source payloads.

The internal `GET /api/health/data` route requires `Authorization: Bearer $INTERNAL_HEALTH_TOKEN` in production and returns inventory, recent run status, source checkpoints, per-market coverage, capacity state, backfill progress, and freshness. `/admin/data` is a browser shell that asks an operator for that token and does not embed it in HTML or JavaScript. Treat `503 initializing` as expected before the first completed sync; investigate `503 degraded`, stale daily data, partial runs, and latest failures.

## Managed PostgreSQL and Vercel

Deploy `platform/web` with `APP_ENV=production`. Set all production secrets in Vercel as Secret variables, never in tracked `.env` files. `DEV_AUTH` and `DEV_STRIPE` must both be the literal `false`; startup paths reject unsafe values unless the explicitly named emergency override is set. Keep that override unset in normal operations.

Use the database provider's transaction-pooled connection string for `DATABASE_URL` and its direct/non-pooled string for `PLATFORM_DATABASE_DIRECT_URL` in migrations and workers. Start with `DATABASE_POOL_MAX=2` per Vercel instance and adjust using provider connection telemetry. Put the database and Functions in nearby regions. TLS policy belongs in the provider URL (`sslmode=verify-full` when supported); the application does not disable certificate verification.

Run migrations as a distinct pre-promotion job with the direct URL, wait for success, and only then promote the matching web build. Migrations are forward-only and recorded in `schema_migrations`.

## Backup and restore

Enable the managed provider's point-in-time recovery before beta traffic. A practical beta baseline is:

- continuous PITR with at least 7 days of retention;
- daily provider snapshot with 30 days of retention;
- weekly logical `pg_dump --format=custom --no-owner --no-acl` retained for 90 days in encrypted, access-controlled object storage;
- quarterly restore drill into an isolated database.

Example logical backup, with credentials supplied through environment or a password file rather than command history:

```powershell
pg_dump --dbname "$env:PLATFORM_DATABASE_DIRECT_URL" --format=custom --no-owner --no-acl --file federal-ledger.dump
```

Restore into a newly provisioned, empty database—never over the active production database:

```powershell
pg_restore --dbname "$env:RESTORE_DATABASE_URL" --clean --if-exists --no-owner --no-acl federal-ledger.dump
```

Then apply any migrations newer than the backup and validate before cutover:

1. Compare row counts for companies, awards, transactions, raw source rows, and ingestion/backfill runs.
2. Confirm every award's disclosed obligation equals its transaction sum where obligations exist.
3. Run `python -m ingestion qa` and offline golden-market queries against the restore.
4. Run web tests and exercise home, search, company, contract, location, agency, and industry pages against the restore.
5. Record restore duration, recovery point, checksums, operator, and any exceptions. Destroy the isolated restore after approval according to data-retention policy.

Never claim a backup is usable solely because it was created; only a successful restore drill establishes recoverability.

## Scale testing

Synthetic benchmark rows require an explicit local opt-in and are rejected in production:

```powershell
$env:ALLOW_BENCHMARK_DATA="true"
python scripts/generate_scale_data.py generate --rows 100000 --batch-size 2000
python scripts/benchmark_queries.py --output-dir reports
python scripts/generate_scale_data.py clean
```

Every generated row is both `is_demo=true` and `is_benchmark=true`; public queries exclude benchmark rows. The generator writes no large fixture files. `benchmark_queries.py` saves real `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans and a small Markdown timing table. Results describe only the database, hardware, row counts, and moment recorded in the report.

## Location-based business change (preview only)

The location-intelligence migration and DC license collector are additive but must not be run against production until the preview validation in `docs/location-business-change.md` passes.

```powershell
python -m movements license-sync --source dc-basic-business-licenses --limit 25
```

The adapter requests only an allowlist of non-personal license fields, suppresses residential premises, creates unresolved establishment candidates, and emits license signals rather than opening outcomes. Increase the limit only after reviewing bounded output and database capacity.
