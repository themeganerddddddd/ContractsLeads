# Company movement release validation

Validation date: 2026-10-23

This report records a bounded release validation against live official sources and an isolated PostgreSQL 16 database. It did not read from or write to the production database. Counts below demonstrate collector, normalization, persistence, and reporting behavior; they are not production inventory counts and must not be presented as nationwide coverage.

## Source coverage validation

| Source | Geographic coverage | Bounded records received | Written | Company matches | Review/unmatched | Failures | Last validation result | License/reuse treatment | Known limitations |
|---|---:|---:|---:|---:|---:|---:|---|---|---|
| Maryland Department of Labor WARN / ESA / Other Dislocations Log | Maryland | 2 | 2 | 0 | 2 unmatched | 0 | Success | License not stated; `unverified` commercial-use status | Current log mixes federal WARN, Maryland ESA, and other dislocations. Reported employees are affected workers, not completed layoffs. |
| Virginia Works WARN Notices | Virginia | 2 | 2 | 0 | 2 unmatched | 0 | Success | License not stated; `unverified` commercial-use status | Company-column addresses are retained as raw evidence, not treated as affected worksites or headquarters. County remains null when the table gives only a locality. |
| Maryland Department of Commerce Press Room | Maryland | 2 | 2 | 0 | 2 unmatched | 0 | Success | License not stated; `unverified` commercial-use status | Only explicit expansion/facility/investment releases are eligible. Jobs and investment are announced commitments, not completed outcomes. |
| Montgomery County Commercial Permits (`i26v-w6bd`) | Montgomery County, Maryland | 100 | 6 relevant permits | 0 | Not applicable; no named parties in source fields | 0 | Success; 94 low-relevance records skipped | Portal metadata states Public Domain | The published dataset does not identify verified occupants or company roles. No company indicator was created from an address or description alone. |
| SEC EDGAR Submissions API | U.S. public issuers with an existing verified CIK | 0 | 0 | 0 | 0 | 0 | Adapter and persistence tests passed; isolated validation database had no CIK targets | U.S. Government Work; identifying `SEC_USER_AGENT` required for live requests | Not production-verified in this release. Coverage excludes unlinked public issuers and private companies. A filing is a disclosure, not proof of an expansion or funding outcome. |

The live source pages used by this release are the Maryland WARN log, Virginia Works WARN table, Maryland Commerce press room, Montgomery County permit dataset, and SEC EDGAR Submissions API. The database stores the exact official source URL for every event or permit version.

## Isolated data-quality result

The bounded run produced:

- 6 canonical movement events and 6 unique stable event fingerprints: 0 exact duplicate events.
- 6 of 6 events source-backed and source-verified: 100%.
- 6 of 6 events with a state: 100%.
- 4 of 6 events with county FIPS: 66.67%; the two Virginia records correctly remain locality-only because the source did not publish a county.
- 6 unmatched company references and no weak automatic matches. This was expected because the isolated database intentionally contained no company inventory.
- 6 commercially relevant canonical permits from 100 reviewed source records, with 0 duplicate permit fingerprints and 0 verified occupants.
- 0 failed source records and 0 failed collectors in the final bounded run.

`python -m movements quality-report --output-dir reports` reproduces the database-backed JSON and Markdown quality report for any deployed environment. It reports source checkpoints, failures, company-match queues, duplicate fingerprints, provenance, geography, and permit relationship quality.

## Release test matrix

| Check | Result |
|---|---|
| Python test suite | 143 passed, 2 skipped |
| Next.js/Vitest suite | 38 passed across 7 files |
| TypeScript | `tsc --noEmit` passed |
| Production build | Next.js 16.4.2 build passed; `/movements` and `/indicators` emitted as dynamic server-rendered routes |
| Dependency audit | 0 npm vulnerabilities |
| Fresh database migration | Migrations 0001 through 0012 applied successfully on PostgreSQL 16 |
| Browser/data flow | `/movements`, a shareable Virginia closure filter, and `/indicators` returned HTTP 200 and rendered the isolated live-source records |

The pre-change production build was blocked by the framework's vulnerable-version check at Next.js 16.4.0. This branch includes the reviewed 16.4.2/Node 24.22.1 security update; the final build and audit pass. No failing baseline test was converted into a passing claim.

## Verification boundary

### Implemented and tested

- Additive migration from a fresh schema through `0012_company_movement_intelligence.sql`.
- Independent, restart-safe Maryland WARN, Virginia WARN, Maryland Commerce, Montgomery County permits, and SEC collector paths.
- Idempotent event/source revision persistence and permit versioning.
- Conservative company matching, review queues, geographic roles, scoring, database-backed search, company/county integration, and coverage UI.
- Live bounded access to all sources except SEC, which had no verified CIK target in the isolated database.

### Implemented but not production-verified

- Applying migration 0012 to the production database.
- Running the collectors against the production company inventory.
- SEC collection with production CIK mappings and the production `SEC_USER_AGENT` secret.
- Production `/movements` and `/indicators` behavior after deployment.

### Blocked pending release approval or credentials

- Production migration, initial bounded ingestion, and workflow enablement require the production direct database secret and deployment approval.
- SEC live collection requires an identifying user-agent secret.
- Sale or redistribution of Maryland and Virginia source-derived records should wait for a licensing review because the source pages do not state reuse terms.

### Planned, not implemented

- Additional WARN/economic-development states and permit jurisdictions.
- Saved-search movement alerts and outbound email.
- Bulk/public APIs, metering, and commercial feed entitlements.
- Hiring, corporate-registration, and commercial-property signals.
- Calibrated movement probabilities; the current score is descriptive and requires multiple independent indicators.
