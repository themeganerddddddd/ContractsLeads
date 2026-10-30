# BusinessCurrent production storage audit

Production measurements were taken read-only on October 28, 2026 against Neon project
`federal-ledger-db`, branch `main`, database `neondb`. This report was finalized on
October 30, 2026. The audit did not expose connection strings, credentials, or payload
contents.

## Provider allowance and guard configuration

- The authenticated Neon console identified the subscription as **Free** and showed
  526.07 MB of provider-metered storage, 102.9 MB of restore history, and a six-hour
  history window for the current billing period.
- Neon increased the current Free allowance to **1 GB of Postgres storage per project**
  on October 2, 2026. The same release also describes 100 projects and a six-hour
  restore window, matching the authenticated console: <https://neon.com/blog/neon-free-plan-1-gb-per-project>.
- PostgreSQL `pg_database_size(current_database())` measured **502,063,104 bytes**.
  Provider metering and PostgreSQL relation accounting are not expected to be identical.
- The repository now uses `DATABASE_CAPACITY_BYTES=1000000000`, matching the provider's
  decimal 1 GB statement rather than assuming 1 GiB. The earlier 512 MiB ingestion guard
  was obsolete and unnecessarily stopped a subset of collectors.
- At the verified guard, production is **50.206% utilized** with **497,936,896 bytes**
  to the provider guard. Configured headroom is 97,936,896 bytes to warning (60%),
  217,936,896 bytes to the historical stop (72%), and 397,936,896 bytes to the
  incremental critical stop (90%).

This allowance is sufficient for current operations but not for a nationwide historical
raw-payload backfill. The storage architecture must move immutable raw history to object
storage before material national expansion.

## Current footprint

| Measure | Bytes | Share of database |
|---|---:|---:|
| Whole database | 502,063,104 | 100.000% |
| Table data/main relation forks | 335,429,632 | 66.810% |
| Indexes | 138,297,344 | 27.546% |
| Sum of public relation totals | 490,102,784 | 97.618% |
| Normalized hot facts | 144,687,104 | 28.819% |
| Raw payload relations | 83,771,392 | 16.685% |
| Version-history relations | 94,691,328 | 18.860% |
| Derived assessment/history | 8,626,176 | 1.718% |
| Permanent identity/outcome data | 3,653,632 | 0.728% |
| Currently archive-capable relation data | 78,913,536 | 15.718% |

The storage classes above classify relation data, not indexes or detached TOAST forks.
They sum to table data; they are not independent whole-database sizes.

## Thirty largest relations

`total_bytes` is authoritative for footprint and can exceed `data_bytes + index_bytes`
because PostgreSQL may account for TOAST and auxiliary relations.

| # | Relation | Data bytes | Index bytes | Total bytes | Live rows | Dead rows |
|---:|---|---:|---:|---:|---:|---:|
| 1 | raw_source_transactions | 78,831,616 | 6,430,720 | 85,901,312 | 41,292 | 6,975 |
| 2 | raw_source_transaction_versions | 73,850,880 | 9,781,248 | 84,107,264 | 41,433 | 280 |
| 3 | procurement_events | 47,497,216 | 23,379,968 | 72,056,832 | 73,122 | 482 |
| 4 | awards | 26,812,416 | 23,814,144 | 50,814,976 | 35,737 | 5,994 |
| 5 | procurement_processes | 27,451,392 | 10,420,224 | 38,600,704 | 39,910 | 4,753 |
| 6 | company_geography_observation_versions | 10,485,760 | 10,133,504 | 20,660,224 | 41,433 | 280 |
| 7 | transactions | 10,739,712 | 9,764,864 | 20,602,880 | 41,292 | 6,367 |
| 8 | award_identity_observation_versions | 10,240,000 | 8,208,384 | 18,489,344 | 41,433 | 278 |
| 9 | award_identity_observations | 8,560,640 | 6,086,656 | 14,688,256 | 41,292 | 7,144 |
| 10 | company_geography_observations | 8,454,144 | 6,037,504 | 14,532,608 | 41,292 | 7,146 |
| 11 | movement_assessments | 7,897,088 | 1,269,760 | 10,190,848 | 5,815 | 3 |
| 12 | procurement_process_releases | 2,342,912 | 1,302,528 | 9,560,064 | 4,476 | 6 |
| 13 | procurement_process_suppliers | 3,342,336 | 5,398,528 | 8,781,824 | 38,558 | 4,951 |
| 14 | companies | 3,604,480 | 5,111,808 | 8,773,632 | 10,060 | 233 |
| 15 | procurement_notices | 2,531,328 | 925,696 | 8,134,656 | 2,656 | 1 |
| 16 | award_industries | 4,341,760 | 2,129,920 | 6,512,640 | 31,149 | 5,163 |
| 17 | procurement_lots | 2,654,208 | 1,835,008 | 4,530,176 | 10,982 | 7 |
| 18 | procurement_contracts | 1,761,280 | 1,351,680 | 3,153,920 | 10,929 | 0 |
| 19 | buyers | 983,040 | 1,064,960 | 2,088,960 | 2,952 | 545 |
| 20 | entity_identifiers | 630,784 | 761,856 | 1,433,600 | 3,300 | 83 |
| 21 | company_momentum | 704,512 | 417,792 | 1,163,264 | 1,545 | 0 |
| 22 | company_discoveries | 712,704 | 335,872 | 1,089,536 | 1,094 | 0 |
| 23 | capacity_observations | 237,568 | 49,152 | 319,488 | 146 | 0 |
| 24 | company_events | 57,344 | 188,416 | 278,528 | 55 | 59 |
| 25 | agencies | 155,648 | 49,152 | 245,760 | 51 | 0 |
| 26 | business_licenses | 106,496 | 81,920 | 237,568 | 50 | 0 |
| 27 | company_event_sources | 65,536 | 81,920 | 229,376 | 57 | 10 |
| 28 | business_license_versions | 98,304 | 65,536 | 196,608 | 50 | 0 |
| 29 | development_permits | 8,192 | 106,496 | 139,264 | 2 | 2 |
| 30 | business_change_signals | 16,384 | 90,112 | 139,264 | 16 | 0 |

## Thirty largest indexes

| # | Index | Table | Bytes | Scans |
|---:|---|---|---:|---:|
| 1 | company_geography_observation_versions_pkey | company_geography_observation_versions | 9,388,032 | 68,098 |
| 2 | procurement_events_event_fingerprint_key | procurement_events | 9,109,504 | 104,492 |
| 3 | raw_source_transaction_versio_source_source_transaction_id__key | raw_source_transaction_versions | 8,814,592 | 68,112 |
| 4 | award_identity_observation_versions_pkey | award_identity_observation_versions | 8,208,384 | 68,064 |
| 5 | company_geography_observations_pkey | company_geography_observations | 5,431,296 | 68,111 |
| 6 | procurement_processes_source_system_source_process_id_key | procurement_processes | 5,087,232 | 79,710 |
| 7 | raw_source_transactions_source_source_transaction_id_key | raw_source_transactions | 4,874,240 | 69,102 |
| 8 | awards_generated_award_id_unique | awards | 4,612,096 | 219,882 |
| 9 | award_identity_observations_pkey | award_identity_observations | 4,202,496 | 68,098 |
| 10 | transactions_source_transaction_id_key | transactions | 4,177,920 | 76,885 |
| 11 | procurement_events_process_date_idx | procurement_events | 3,129,344 | 12 |
| 12 | procurement_events_award_date_idx | procurement_events | 2,932,736 | 3 |
| 13 | procurement_events_pkey | procurement_events | 2,801,664 | 8 |
| 14 | procurement_process_suppliers_pkey | procurement_process_suppliers | 2,736,128 | 71,649 |
| 15 | procurement_process_suppliers_company_idx | procurement_process_suppliers | 2,662,400 | 20 |
| 16 | procurement_events_company_date_idx | procurement_events | 2,383,872 | 13,944 |
| 17 | transactions_award_date_idx | transactions | 2,301,952 | 128,912 |
| 18 | award_industries_pkey | award_industries | 2,129,920 | 74,455 |
| 19 | transactions_pkey | transactions | 1,990,656 | 0 |
| 20 | procurement_processes_pkey | procurement_processes | 1,900,544 | 282,037 |
| 21 | award_identity_observations_piid_idx | award_identity_observations | 1,884,160 | 0 |
| 22 | awards_amount_sort_idx | awards | 1,875,968 | 0 |
| 23 | procurement_events_type_date_idx | procurement_events | 1,826,816 | 1 |
| 24 | awards_pkey | awards | 1,654,784 | 422,557 |
| 25 | awards_procurement_process_idx | awards | 1,646,592 | 0 |
| 26 | companies_name_trgm_idx | companies | 1,638,400 | 0 |
| 27 | raw_source_transactions_pkey | raw_source_transactions | 1,556,480 | 38 |
| 28 | awards_recipient_date_idx | awards | 1,548,288 | 1,164 |
| 29 | awards_agency_date_idx | awards | 1,441,792 | 6 |
| 30 | awards_industry_date_idx | awards | 1,261,568 | 15 |

Zero scan counts are observations since the statistics reset, not proof that an index is
safe to remove. No production index was dropped.

## Assessment-history decision

`movement_assessments` contains **5,815 rows** and occupies 10,190,848 total bytes
(2.030% of the database). The distribution is 5,691 expansion, 49 relocation, 25
growth, 25 contraction, and 25 closure/distress assessments. It is valuable for model
audit, regression comparison, and rebuilding the evidence-to-outcome path. It is not
worth deleting for approximately 10 MB of savings. The new retention policy keeps five
years hot and permits archive only when the assessment is not the sole evidence for an
outcome. `business_change_assessments` currently contains zero rows.

## Bloat and maintenance action

The audit found 12–17% dead tuples in eight active procurement relations. On October
28, 2026, targeted ordinary `VACUUM (ANALYZE)` completed successfully for
`raw_source_transactions`, `awards`, `procurement_processes`, `transactions`,
`award_identity_observations`, `company_geography_observations`, `award_industries`,
and `procurement_process_suppliers`. No `VACUUM FULL`, mass delete, table rewrite, or
manual index removal was performed.

## Retention eligibility at the measurement date

The earliest raw/version observations are October 21–28, 2026. Exactly zero rows in
`raw_source_transaction_versions`, `business_license_versions`,
`development_permit_versions`, or `company_event_sources` are older than their new
five-year or ten-year cutoffs. A conversion today can verify the archive path but cannot
safely reclaim production PostgreSQL storage yet.
