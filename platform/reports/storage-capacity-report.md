# Production storage-capacity report

Measured 2026-10-22 against the live Neon production database after migrations
0008–0011 and bounded U.S., UK, and TED samples. Provider capacity is supplied
at runtime as `DATABASE_CAPACITY_BYTES=1073741824` (1 GiB). Thresholds are
configuration: warning 60%, historical stop 72%, critical incremental stop 90%.

## Current footprint

| Measure | Bytes | Share of database |
|---|---:|---:|
| Whole database | 145,039,360 | 100% |
| Raw/version-bearing relations | 41,558,016 | 28.653% |
| Other normalized/index/overhead | 103,481,344 | 71.347% |

Raw/version-bearing relations are `raw_source_transactions`,
`raw_source_transaction_versions`, `procurement_process_releases`, and
`procurement_notices`. The largest individual relations are
`procurement_events` (33,374,208 bytes), `procurement_processes` (19,079,168),
`raw_source_transaction_versions` (18,710,528),
`raw_source_transactions` (17,809,408), and `awards` (13,025,280).

At the measured footprint, 499,205,734 bytes remain before warning,
628,054,753 before the historical stop, and 821,328,281 before the critical
incremental stop. Relation and index sizes are page-granular, so small-sample
bytes-per-record values are estimates, not exact forecasts.

## Source enumeration and sample growth

| Source | Official volume observation | Bounded production sample | Measured growth | Observed bytes/new record |
|---|---:|---:|---:|---:|
| USAspending | 30,845,871 contract transactions, 2021-10-01–2026-10-21 | 250/250 new, 2022-01-01–07 | 1,097,728 bytes | 4,391 |
| UK Find a Tender | 2,415 releases, 2026-10-15–21 | 482 new, 18 duplicates, 0 failures | 2,768,896 bytes | 5,745 |
| EU TED | 18,723 notices, 2026-10-15–21; 871,149 in calendar 2025 | 240 new, 10 duplicates, 0 failures | 3,170,304 bytes | 13,210 |

The USAspending official full archives selected for the requested period are
approximately 2.09 GB (FY2022), 2.06 GB (FY2023), 2.04 GB (FY2024), 1.99 GB
(FY2025), 1.53 GB (FY2026), and 4.3 MB for the first 21 days of FY2027: about
9.7 GB compressed before database expansion. Recent TED monthly `.tar.gz`
packages measured roughly 334–382 MB each; the loader enforces a configurable
pre-download maximum and processes one package at a time.

## Conservative projection

| Source target | Record estimate | Projection from observed production growth |
|---|---:|---:|
| U.S. FY2022–FY2027-to-date | 30.85 million | about 126 GiB observed-rate; use 126–252 GiB planning range because full archive rows are wider |
| UK three to five years | about 378,000–630,000 at the measured weekly rate | about 2.0–3.4 GiB observed-rate; plan 2–7 GiB |
| TED three to five years | about 2.6–4.4 million at 2025 volume | about 32–54 GiB at the initial measured representation; remeasure after the compact release-pointer optimization |

Even the lower bounds exceed the 1 GiB project. At the present stop buffer,
only about 143,000 U.S. sample-shaped transactions, 109,000 UK releases, or
47,000 TED sample-shaped notices would fit if loaded alone. A complete
multi-market historical backfill is therefore unsafe on the current plan.

## Decision

`DATABASE_UPGRADE_REQUIRED`

No full historical job should start until the operator approves a storage
change. The practical target is a managed PostgreSQL tier sized for normalized
query data plus indexes and WAL, paired with object storage for immutable raw
archives/revisions. Store compressed source packages by source/date with a
SHA-256 manifest; keep exact official URL, package key, member name, payload
hash, parser version, and object pointer in PostgreSQL. Do not delete existing
history during that migration. After provisioning, re-run a bounded sample,
update `DATABASE_CAPACITY_BYTES`, and require the projection to remain below
the configured historical stop before resuming.

