# Company intelligence production readiness

Assessment date: 2026-10-23 (America/New_York)

Decision: **not approved for production migration, deployment, or scheduling yet**. The feature branch is integrated with current `origin/main`, the additive implementation is regression-tested, and bounded official-source collection demonstrates useful real candidates. Production execution remains gated on a verified restorable backup, a direct production database credential, and a compliant SEC user agent.

## 1. Branch and reconciliation

`feature/company-intelligence-v1` was reconciled with `origin/main` after the latest daily contract update. The merge completed without conflicts. Existing procurement history and source URLs remain intact; the movement schema and fields are additive.

## 2. Regression and build validation

- Python: 149 passed, 2 skipped.
- Web tests: 38 passed across 7 files.
- TypeScript: passed.
- Next.js production build: passed.
- Dependency audit: 0 known vulnerabilities.
- Diff whitespace validation: passed.

The React changes remain server-rendered, preserve typed data access and accessible structure, and add no client fetch waterfall or new hook lifecycle.

## 3. Migration safety and status

Migration `0012_company_movement_intelligence.sql` is additive: it creates new movement-intelligence tables and indexes and registers new data sources and coverage rows. It contains no `DROP`, `TRUNCATE`, `DELETE`, or destructive rewrite of existing procurement tables. An automated test protects that property.

The full migration chain through `0012` previously succeeded against fresh PostgreSQL 16. The metadata-only licensing correction made during this review does not change table structure. A fresh local rerun could not be completed because the local Docker engine was unavailable.

Production migration has **not** been run. The Vercel project has a pooled `DATABASE_URL`, but the required `PLATFORM_DATABASE_DIRECT_URL` is absent and secret values cannot be pulled locally. No production backup or restorable snapshot was independently verified. Applying a migration without both controls would violate the production gate.

## 4. Production and deployment status

The Vercel project was explicitly identified as `west-tech/federal-ledger` with project ID `prj_Fg25FyslMHvVUzEtOiE4HVU6ZXMU` and application root `platform/web`.

Read-only production checks returned HTTP 200 for the landing page, search, GB contract search, EU contract search, pricing, and auth-session endpoint. `/movements` and `/indicators` returned 404, as expected because the feature has not been deployed. Pricing, billing, outbound email, and authentication behavior were not changed.

The pushed feature branch produced a Ready Vercel preview deployment. Authenticated checks confirmed that `/movements` and `/indicators` render their route shells and explicit "Database not available" state. The preview has no branch-specific `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, `AUTH_SECRET`, or `INTERNAL_HEALTH_TOKEN`; consequently procurement `/search` returns HTTP 500 there. This preview proves build and route availability only, not database integration or production-like end-to-end behavior.

The collection workflow has no scheduled trigger. It remains available only by explicit manual dispatch and must stay that way until the production gates in the operations runbook are met.

## 5. Bounded live-source results

A read-only comparison collected bounded current data from three official sources independently and compared it with the checked-in production contract snapshot:

| Source | Received | Normalized | Failed |
|---|---:|---:|---:|
| Maryland WARN | 100 | 100 | 0 |
| Virginia WARN | 100 | 100 | 0 |
| Maryland Commerce | 7 | 7 | 0 |

A separate Montgomery County commercial-permit sample received 100 records, classified 13 as relevant, skipped 87, and failed 0. The relevant sample contained 11 high-value commercial records, one warehouse record, and one commercial new-construction record. These results are validation evidence, not production ingestion.

SEC collection was not run live because no verified CIK targets and no compliant `SEC_USER_AGENT` were available. The adapter remains covered by automated tests. This limitation must not be represented as successful live SEC coverage.

## 6. Company-match quality

The snapshot comparison covered 3,000 procurement companies and 207 movement events:

| Outcome | Events |
|---|---:|
| Authoritative identifier match | 0 |
| Unique exact-name candidate, pending review | 10 |
| Ambiguous | 54 |
| Unmatched | 143 |

Eight companies have candidate-linked procurement and movement evidence. All remain `pending_review`; none is promoted to an authoritative company relationship because the movement records lack UEI, CAGE, or CIK identifiers and no human approval exists in the production database. This conservative result is a quality control, not a failed attempt to manufacture coverage.

Representative candidates include Peraton (Maryland and Virginia layoffs plus one procurement record), Charles River Laboratories (Maryland closure plus 11 procurement records), CLYM Environmental Services (Maryland expansion plus one procurement record), TekSynap, Hendall, Federal Express, Kay and Associates, and KBR Wyle Services. BAE Systems is deliberately ambiguous because the procurement snapshot contains multiple legal entities/UEIs that could fit the observed name. The generated snapshot report retains the original official evidence URLs for every linked example.

## 7. Coverage and indicator behavior

Company identity resolution first requires a unique verified UEI, CAGE code, or CIK. Name-only matches are review candidates. Ambiguous and unmatched events are retained with source evidence instead of discarded or silently linked. Company headquarters, recipient address, and place of performance remain separate; a Montgomery County recipient or permit location is never promoted to headquarters without independent evidence.

The interface now distinguishes multi-source indication scores from individual source-backed indicators. A candidate event can enrich a reviewed company profile, but a single unapproved name match cannot create an authoritative multi-source signal.

## 8. Source reuse and attribution

- USAspending records retain their federal source URLs and existing attribution model.
- SEC states that public EDGAR filing content is free to access and reuse, subject to fair-access controls. Collection requires an identifying organization/application and real contact in `SEC_USER_AGENT` and must stay within SEC request-rate guidance.
- Montgomery County permit data is governed by the county Open Data Terms of Use. The implementation labels it `permitted_with_conditions`, retains the terms URL, and requires attribution; it does not claim public-domain status.
- Maryland and Virginia WARN and Maryland Commerce are official public sources, but their commercial reuse status has not been independently cleared in this review. Product packaging should preserve direct links and avoid bulk resale or redistribution claims until counsel or the source owner confirms the applicable terms.

## 9. Commercial assessment

The feature is already useful to economic-development organizations, corporate real-estate teams, and federal-market researchers as a source-discovery and analyst-review layer: it brings contracts, expansion announcements, layoffs/closures, and material permits together while exposing provenance and uncertainty.

It is not yet reliable enough for unattended lead generation, automated outreach, or claims that a company is expanding or contracting at its headquarters. The present sample has zero authoritative identifier joins, material ambiguity, limited geographic coverage, and no live SEC validation.

A defensible packaging boundary is:

- Free: source discovery, basic search, geographic coverage disclosures, original evidence links, and limited public company/event views.
- Paid after production validation and legal review: saved lists, exports, alerts, reviewed entity relationships, richer coverage analytics, team workflows, and rate-limited APIs.
- Excluded until explicitly cleared: bulk republication of source datasets, resale of county data without required terms and attribution, automated decisions based on pending matches, and outbound messaging based solely on inferred events.

No pricing, billing, entitlements, or email flows were modified as part of this work.

## 10. Remaining blockers and approval checklist

Before production release:

1. Record a successful production backup or restorable snapshot ID and timestamp.
2. Add a production-only `PLATFORM_DATABASE_DIRECT_URL` without exposing its value.
3. Add a compliant `SEC_USER_AGENT` if SEC collection will be enabled.
4. Apply migration `0012`, verify the migration ledger, and confirm existing procurement counts and representative records are unchanged.
5. Run one bounded source at a time and record received, written, skipped, duplicate, failure, checkpoint, ambiguous, and unmatched totals.
6. Review and approve or reject representative name candidates; do not convert the current report's candidates automatically.
7. Supply an isolated preview database and production-like preview configuration, then verify company, movement, indicator, search, auth, and pricing flows. Do not point the preview at production merely to bypass this gate.
8. Deploy production only after those checks pass; keep scheduling disabled during initial observation.
9. Enable a conservative schedule only through a separately reviewed change.

If credentials or backup evidence remain unavailable, the safe stopping point is the tested feature branch and this report. No production migration or release should be attempted by inference.

## Company Tracking Product

The earlier movement implementation produced candidate links but did not create a Federal Ledger-owned monitoring registry. Migration `0013_company_tracking_product.sql` adds platform monitor targets, independent per-source state, discovered-company evidence, deduplicated alerts, and audit history while leaving personal `company_watches` unchanged.

### Current validation inventory

No production or local validation database was written during this corrective phase. The production migration gate remains closed, and the local Docker/PostgreSQL engine is unavailable. Consequently the truthful database-backed counts are:

| Measure | Current verified count |
|---|---:|
| Production monitor targets | Not migrated / not queryable |
| Active targets | Not migrated / not queryable |
| Paused targets | Not migrated / not queryable |
| Tracked companies with procurement activity | Not migrated / not queryable |
| Tracked companies with movement activity | Not migrated / not queryable |
| Tracked companies with permit relationships | Not migrated / not queryable |
| Tracked companies with verified-CIK SEC eligibility | Not migrated / not queryable |
| New tracked-company signals | Not run against a migrated database |
| Deduplicated alerts generated | Not run against a migrated database |

The feature does not seed or auto-track the eight earlier validation candidates. Peraton, Charles River Laboratories, Hendall, TekSynap, Federal Express, CLYM Environmental Services, Kay and Associates, and KBR Wyle remain discovered/pending candidates until reviewed. BAE Systems remains ambiguous across legal entities/UEIs.

The latest bounded snapshot match evidence remains: 0 authoritative identifier matches, 0 analyst-approved production relationships, 10 pending exact-name events, 54 ambiguous events, and 143 unmatched events. Approved and rejected production counts are both 0 because no production review action was taken.

### Implemented tracking behavior

- Exact `company_id` selection; idempotent add/reactivate; active, paused, review-required, and archived states; high/normal/low priority; source-family switches; append-only audit records.
- Immediate evaluation of already-ingested U.S., UK, and EU/TED procurement events without per-company recollection.
- Source-oriented evaluation of approved movement, permit, and SEC relationships; SEC is marked identifier-required when no verified CIK exists.
- Discovery records for procurement, movement, permit, SEC, ambiguous, pending, unmatched, and rejected evidence.
- Deduplicated `alert_events` generation for awards, modifications, other procurement events, movements, reviewed permits, SEC filings, and opted-in authenticated saved-search/region matches. User-owned alert rows stay out of the public alert feed. Saved-search/region evaluation has not been run against a migrated validation or production database. Email delivery remains off.
- Public `/tracked-companies`, `/discovered-companies`, `/alerts`, and unified company timelines; internal-token `/admin/company-match-reviews` management.

### Exact coverage

- U.S. procurement: nationwide records linked to the legal entity.
- UK Find a Tender: UK records where the legal entity link is reliable.
- EU/TED: EU/TED records where the legal entity link is reliable.
- Workforce: Maryland and Virginia WARN sources only.
- State expansion announcements: Maryland only.
- Commercial permits: Montgomery County, Maryland only, and never linked by address alone.
- SEC EDGAR: selected filings for companies with verified CIKs; live collection still requires `SEC_USER_AGENT`.

### Remaining end-to-end gate

The code is not declared production-complete until a migrated validation database proves that one reviewed real company can be added, appears publicly with its identifiers and existing procurement history, receives a deduplicated update from a subsequent source event, displays approved movement evidence and explicit unsupported coverage, and retains official URLs in its timeline. The missing restorable production backup, direct production database credential, valid SEC user agent, and isolated preview database remain the actual blockers.
