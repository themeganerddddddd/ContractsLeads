# BusinessCurrent / federal-ledger-db — Neon free-tier quota recovery
_Last checked November 15, 2026_

## Confirmed findings

- User reports Neon project `federal-ledger-db` is paused because it reached its **monthly Free-plan limit**.
- The redesigned Vercel Preview returns `/api/status/public`: `status=unconfigured`, which confirms its running process lacks `DATABASE_URL` (and does **not** establish database data integrity).
- The agent's Vercel connection can see the `WestTech` team but cannot list project `federal-ledger` or read/update its environment variables. Production and Preview connection settings have **not** been altered.
- This repository's **main** branch previously ran three Neon-using workflows daily (US, UK/global and EU) plus one weekly reconciliation. The global workflow also ran historical model backtesting daily. These are plausible compute/egress contributors but **the exhausted metric and root cause have not been verified in Neon's Usage dashboard**.
- Existing data has not been deleted or copied. No Neon billing change has been authorized or performed.

## Immediate resource protection

On 2026-11-15 the following automatic GitHub schedules were disabled in `main` **without disabling workflow_dispatch**:

| Workflow | Former UTC schedule | Current mode |
| --- | --- | --- |
| `platform-ingestion.yml` | Daily 10:42 | Manual only |
| `platform-global-intelligence.yml` | Daily 09:27 | Manual only |
| `platform-eu-ted.yml` | Daily 12:17 | Manual only |
| `platform-reconciliation.yml` | Sunday 11:17 | Manual only |

The separate `platform-company-movements.yml` was already manual-only, and `update-contracts.yml` updates the repository's static federal-contract data rather than this database and was left unchanged. No migration, destructive SQL, or backfill has run.

**Impact:** the existing company/contract database will stop receiving automated refreshes until explicitly re-enabled. The static public federal update remains operational. This pause prevents unreviewed jobs from immediately restarting against a resumed Neon compute. It does not reactivate Neon's suspended project.

## Required owner-side recovery actions (no passwords in chat)

1. Open **Neon Console → organization containing `federal-ledger-db` → Usage** and record the exhausted category (**compute CU-hours**, **public network transfer**, or another quota), actual usage versus allowance, and **next billing-period reset date**. The project alert alone does not identify the resource.
2. Restore service by waiting for Neon's monthly quota reset **or** deliberately upgrading the owning Neon organization to Launch if an earlier restoration is worth the cost. A paid upgrade changes billing; it should be completed only by the account owner. Avoid running importers until rates are understood.
3. Before changing the schema or moving data, create an appropriate snapshot/backup when the project is reachable. A quota-suspended compute cannot produce `pg_dump` until resumed; don't delete the project or create a blank replacement as a workaround.
4. Confirm the original records exist. A small read-only sanity query is `SELECT count(*) FROM companies;` plus `SELECT count(*) FROM awards;`. Then inspect current migrations in `schema_migrations` and run only reviewed, forward-only migrations.
5. In **Vercel → WestTech → federal-ledger → Settings → Environment Variables**, configure **Preview** `DATABASE_URL` using a **pooled URL for an isolated Neon Preview branch or cloned data set**. Don't point draft-branch code at a writable production database, and never commit URLs/credentials. Configure all other required nonpublic runtime settings per `platform/docs/preview-live-data-recovery.md` (on the feature branch) / `platform/docs/deployment.md`.
6. Redeploy the feature Preview to apply changed env values and check `/api/status/public` again. A response of `ready` only establishes the basic companies/awards presence; independently check actual company, contract and movement pages.
7. Re-enable collection **gradually**, manually first: one bounded USAspending sync; inspect CU-hours and network transfer delta in the Neon Usage dashboard; then test UK and EU independently on another day. Run full model backtests far less frequently than daily. Choose schedules from measured consumption and required freshness, not a generic cron.
8. Limit Neon compute to 0.25 CU or the smallest workable autoscaling range, keep idle scale-to-zero enabled, avoid web-request polling, bound query results/page size, and keep separate Preview/Production DBs if paid. Observe the impact on billable CU-hours before raising autoscaling or re-enabling workers.

Current Neon Free limits in published documentation (October 2026) include 100 CU-hours/project/month, 5 GB public network transfer/project/month and 1 GB Postgres storage/project, with variation by plan/version. **Verify the actual limits shown by your own Neon organization**, which are authoritative.

## Read-only diagnostics once Neon is online

```sql
SELECT current_database() AS db, pg_size_pretty(pg_database_size(current_database())) AS size;
SELECT count(*) AS companies FROM companies;
SELECT count(*) AS awards FROM awards;
SELECT schemaname, relname, n_live_tup, n_dead_tup, seq_scan, idx_scan
FROM pg_stat_user_tables
ORDER BY seq_tup_read DESC NULLS LAST LIMIT 20;
```

`pg_stat_user_tables` and table sizes do **not** tell you Neon's billable CU-hours or egress; use Neon Usage charts for that. Do not expose connection URLs or tokens in diagnostics.

## Re-enabling schedules

After the owner restores Neon and verifies usage, restore `schedule:` in each workflow under `on:` using a reviewed small-batch cadence. Favor a bounded weekly US contract refresh first, with separate weekly/monthly UK/EU and monthly model maintenance as needed. Reintroduce one schedule at a time, verify Neon Usage and Postgres data freshness, then expand only if within budget. Avoid overlapping refresh jobs. Keeping workers manual until an explicit cost budget is established is safer than immediately re-enabling all original daily jobs.

No change in this document can itself resume a free-plan database suspended by Neon or give Vercel access to unshared team resources.
