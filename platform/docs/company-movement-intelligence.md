# Company movement intelligence

## Boundary from procurement

`procurement_events` remains the lifecycle ledger for tenders, awards, contracts, modifications, options, and completion. `company_events` records broader corporate movements and disclosures. A contract award can be supporting evidence, but it is never converted into an expansion without independent evidence.

The geography model is intentionally separated:

- `companies.recipient_*`: address reported in procurement data; not a verified headquarters.
- `awards.performance_*`: place where contracted work is reported.
- `company_event_locations`: affected, origin, destination, facility, permit, or other event geography.
- `company_locations`: independently sourced operating locations only.
- `development_permits`: project sites; no occupant relationship unless the source names and verifies one.

## Schema added by migration 0012

| Structure | Purpose |
|---|---|
| `company_events` | Stable canonical event, status, dates, reported jobs/investment, verification, and primary geography. |
| `company_event_sources` | Append-only content-hashed evidence revisions, direct URL, publisher, observed time, license status, and raw source fields. |
| `company_event_companies` | Typed, confidence-scored, reviewable company relationships. |
| `company_event_locations` | Multi-location event roles without promoting an event site to headquarters. |
| `company_locations` | Independently verified offices/facilities and their operational history. |
| `company_match_reviews` | Unmatched, ambiguous, pending, approved, and rejected match queue. |
| `development_permits` | Canonical permit facts and conservative commercial relevance classification. |
| `development_permit_versions` | Append-only permit revisions keyed by content hash. |
| `permit_company_relationships` | Explicit owner, tenant, occupant, developer, applicant, or contractor roles. |
| `movement_indicators` | Atomic evidence signals with geography, strength, reliability, observation time, and associated events. |
| `movement_assessments` | Versioned descriptive scores and insufficient-evidence results. |
| `geographic_source_coverage` | Actual source, geography, event family, cadence, and limitations. |

All public movement results use PostgreSQL filtering, sorting, counting, and pagination. Stable fingerprints make ingestion idempotent. Original evidence revisions are retained rather than replaced.

## Initial source coverage

| Source | Geography | What is collected | License/reuse treatment | Important limitations |
|---|---|---|---|---|
| Maryland Department of Labor WARN / ESA / Other Dislocations Log | Maryland | Current public log: employer, worksite, local area, reported affected workers, notice/effective dates, and type. | License not stated; normalized facts carry `unverified` commercial-use status and a direct source link. | The log mixes federal WARN, Maryland ESA, and other dislocations. Inclusion is not an independent finding that federal WARN thresholds apply. |
| Virginia Works WARN Notices | Virginia | Statewide official table: employer, affected locality, reported affected workers, notice/impact dates, notice type, and direct notice document when published. | License not stated; normalized facts carry `unverified` commercial-use status and direct official notice links. | The address displayed under the employer is retained as raw evidence but is not promoted to an affected worksite or headquarters; county FIPS remains null when the source gives only a locality. |
| Maryland Department of Commerce Press Room | Maryland | Official releases explicitly describing expansions, facilities, headquarters, investment, or jobs. | License not stated; normalized facts carry `unverified` commercial-use status and direct source links. | Figures are announced commitments, not completed outcomes. Extraction is conservative and company matches remain reviewable. |
| Montgomery County Commercial Permits (`i26v-w6bd`) | Montgomery County, Maryland | Commercial permits, dates, status, site, work/use, description, area, and applicant-declared value. | Use is subject to the Montgomery County Open Data Terms of Use, including required attribution and disclaimers. Commercial use is treated as permitted with conditions, not as an unconditional public-domain grant. | Published fields do not provide parcel, applicant, contractor, developer, owner, or verified occupant. Those fields remain null and no company is inferred. |
| SEC EDGAR Submissions API | Verified CIK targets nationwide | Filing history and direct filing links for selected forms and 8-K items. | The SEC reuse policy states that EDGAR public filing content is free to access and reuse. Collection still requires a declared user agent and compliance with the fair-access rate limit. | A filing is a disclosure, not proof of funding, expansion, facility activity, or employment outcomes. |

The `/movements#coverage` page exposes these limits. The interface supports national filters, but this release does not claim nationwide movement-source completeness.

## Matching and event publication

Authoritative identifiers (currently verified SEC CIK, plus the existing UEI/CAGE architecture) may be auto-linked. A unique exact normalized name may be displayed on a company profile with `pending` review. Fuzzy matches are review suggestions only. Unmatched source records are retained. The collectors do not create a new procurement company solely from a movement mention.

Cancelled and rescinded records update the canonical status while preserving every source revision. Announced jobs and investments are labeled as announced. WARN employee counts are labeled affected, never completed layoffs.

## Descriptive indication scoring

`movement-indication-v1` is not a probability. It:

- uses only evidence actually observed on or before the assessment date;
- deduplicates repeated evidence tied to one canonical event;
- applies reliability, strength, confidence, and 180-day time decay;
- requires at least two indicator types from two source systems before showing a score;
- persists insufficient-evidence outcomes and every historical version;
- stores its components and evidence keys for reproduction.

Probability claims remain disabled until enough historical outcomes exist for out-of-time precision, recall, calibration, false-positive, false-negative, geographic-accuracy, and lead-time evaluation.

## Commercial readiness

Currently suitable for controlled subscription use:

- source-linked movement search and company/county profiles;
- Maryland and Virginia WARN records plus Maryland official economic-development announcements with prominent limitations;
- Montgomery County permit intelligence with the County-required attribution and disclaimer;
- SEC disclosure timelines for companies with verified CIKs;
- internal stable IDs, observation timestamps, license status, and quality metadata for a future licensed feed.

Experimental or not yet sellable as comprehensive data:

- national movement coverage;
- unreviewed name-only company matches;
- indication scores as outcome forecasts;
- unrestricted bulk API/export access;
- email alerts;
- private-company funding coverage.

## Prioritized roadmap

1. Add more official WARN adapters in states with stable machine-readable feeds; value high, licensing usually manageable, implementation medium.
2. Add DC and Northern Virginia commercial permits after verifying field quality and portal reuse terms; value high, implementation medium/high.
3. Add Orleans and Jefferson Parish permit sources after verifying current official endpoints and licensing; value high for the target market, implementation medium/high.
4. Add more state economic-development feeds with structured releases; value medium/high, implementation medium.
5. Add reviewed SEC CIK mappings and filing-document text extraction with strict rate controls; value high for public companies, implementation high.
6. Add corporate registrations, hiring, and commercial-property sources only after reuse rights are established; value high, licensing risk high.
7. Evaluate outcomes and lead time before training or publishing movement probabilities.
