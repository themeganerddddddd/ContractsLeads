# Company movement operations

## Deployment order

1. Back up the production database using the existing runbook.
2. Apply additive migrations with `python platform/scripts/manage_db.py migrate` using the direct PostgreSQL URL.
3. Run bounded collectors and inspect checkpoints, match queues, and coverage.
4. Deploy the Next.js application.
5. Enable `.github/workflows/platform-company-movements.yml` only after the bounded run is accepted.

Migration `0012_company_movement_intelligence.sql` does not delete or rewrite procurement data. The old application can continue operating after the migration and before the new web release.

## Environment

Existing variables remain unchanged. Workers use `PLATFORM_DATABASE_DIRECT_URL`; the web uses pooled `DATABASE_URL`.

`SEC_USER_AGENT` is required only for EDGAR collection. It must identify the organization/application and a real contact as required by SEC fair-access guidance. It is not an API key. No new paid service, billing flow, or database is required.

## Bounded validation

```powershell
cd platform
python scripts/manage_db.py migrate
python -m movements sync --source maryland-warn --limit 10
python -m movements sync --source virginia-warn --limit 10
python -m movements sync --source maryland-commerce --limit 10
python -m movements permit-sync --since 2026-10-01 --limit 100
python -m movements sec-sync --limit 25
python -m movements assess --assessment-type growth
```

Each source records `running`, `success`, `partial`, or `failed` state in `source_checkpoints`. One source or record failure does not roll back successful independent sources. Permit collection uses a 14-day overlap because the public dataset exposes application date rather than a row-level modification timestamp.

## Quality and coverage checks

Use the following queries after a run:

```sql
SELECT source_system,status,records_seen,records_written,error_summary,updated_at
FROM source_checkpoints
WHERE source_system IN ('maryland_warn','maryland_commerce_press','montgomery_county_commercial_permits','sec_edgar_submissions')
ORDER BY source_system;

SELECT source_system,count(*) AS events,
       count(*) FILTER (WHERE verification_status='source_verified') AS source_verified
FROM company_events GROUP BY source_system ORDER BY source_system;

SELECT match_status,count(*) FROM company_match_reviews GROUP BY match_status ORDER BY match_status;

SELECT source_system,count(*) AS revisions,count(DISTINCT event_id) AS events
FROM company_event_sources GROUP BY source_system ORDER BY source_system;

SELECT relevance_classification,count(*),sum(project_value) AS declared_value
FROM development_permits GROUP BY relevance_classification ORDER BY count(*) DESC;

SELECT country_code,state_code,event_type,coverage_status,known_limitations
FROM geographic_source_coverage ORDER BY country_code,state_code,event_type;
```

Interpret duplicate rate from source revisions sharing one event; content-hash uniqueness prevents exact revision duplication. Geographic quality is the share of records with a state and, where the source reports a county, a county FIPS. Company-match quality must be reviewed by match method and status; pending matches are not counted as authoritative.

## Scheduling and capacity

The workflow is intentionally manual-only: it has `workflow_dispatch` and no `schedule` trigger. Do not restore a cron trigger until all of the following evidence has been recorded:

- a production backup or restorable snapshot identifier and timestamp;
- a production direct PostgreSQL connection in `PLATFORM_DATABASE_DIRECT_URL`;
- successful production application of migration `0012` with its migration-ledger row verified;
- bounded collector counts, failures, checkpoints, and review-queue totals;
- review acceptance of representative matches, ambiguous candidates, and unmatched records;
- successful production checks of `/movements`, `/indicators`, procurement search, authentication, and pricing; and
- a compliant `SEC_USER_AGENT` before SEC collection is enabled.

When scheduling is approved, the workflow's concurrency group remains separate from procurement ingestion. Migration is one prerequisite job; Maryland WARN, Virginia WARN, Maryland Commerce, permits, and SEC then run with source-level failure isolation. Assessments run even if one collector fails, using only evidence successfully committed.

Start with bounded workflow dispatches. The permit collector persists only relevant commercial records and append-only revisions. SEC collection is limited to verified CIKs already present in the database. These controls avoid a nationwide backfill and do not require new infrastructure spend.

## Manual review

Review `company_match_reviews` before approving name-only associations. Do not approve a permit relationship unless the official record or another independently verified source identifies the role. Never convert `company_events` or permit sites into a headquarters record without independent evidence.

## Rollback

Application rollback is a normal Vercel deployment rollback. The additive tables may remain in place because older code does not reference them. Do not drop the new tables to roll back the web release; doing so would destroy collected source history.

If a bounded production run reveals a quality problem, leave the schedule disabled, stop new collection, and retain all already collected records and source revisions. Roll back only the application deployment. Correct the collector or matching rules, rerun the bounded source, and document how the previously collected records were handled; never truncate procurement or movement history as a rollback shortcut.
