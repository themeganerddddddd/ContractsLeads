# BusinessCurrent national source rollout

Finalized October 30, 2026. The product promise is national; the source matrix is honest
about what is active, partial, planned, blocked, or unsupported in each of the 50 states
and the District of Columbia.

## Rollout score

Every state/source-family candidate receives an explainable 0–100 score only after the
source, reuse terms, and access method are verified:

| Factor | Weight |
|---|---:|
| Business density | 20% |
| Commercial value of the source family | 20% |
| Source quality and authority | 15% |
| Automation feasibility | 15% |
| Reuse/license clarity | 10% |
| Update frequency | 10% |
| Location specificity | 10% |

Customer demand is deliberately excluded. Missing evidence is not silently scored as a
positive. `operations.rollout.rollout_score_detail` returns both the score and its inputs;
`national_source_coverage.priority_factors` stores the evidence used for any published
priority.

## Recommended sequence

### Foundation already in production

- Nationwide: federal Government Business facts via USAspending. Recipient address,
  place of performance, and verified headquarters remain separate concepts.
- Maryland: WARN, official Commerce announcements, and partial Montgomery County
  commercial permits.
- Virginia: WARN.
- District of Columbia: partial Basic Business License observations.

### Wave 1: validate the national pattern

Select 5–8 high-business-density states only after official registration/license/WARN
sources, terms, and automation feasibility are recorded. California, Texas, Florida,
New York, Pennsylvania, Illinois, Ohio, Georgia, North Carolina, and New Jersey are
initial research candidates—not claimed active coverage and not assigned fabricated
scores. Prioritize one strong family per state before adding weak breadth.

### Wave 2: add complementary source families

For Wave 1 states plus Maryland/Virginia/DC, add official registrations, licenses,
commercial permits/occupancy, WARN, and economic-development announcements where reuse
is permitted and location semantics are clear. A collector remains isolated: one failure
is logged and cannot stop other state/source collectors.

### Wave 3: complete 50-state plus DC availability

Research and onboard remaining states by verified score, publishing planned/blocked/
manual statuses rather than implying live national depth. Preserve official source URLs,
raw archive manifests, and every source limitation.

### Wave 4: deepen longitudinal intelligence

Increase refresh frequency, backfill only within capacity, populate monthly company/
establishment/geography-industry features, and run annual Parquet exports. Confirmed
outcomes and canonical identities remain permanently queryable.

## Source-family onboarding gate

A source is not marked `active` until all of the following are recorded:

1. Official publisher and stable source URL.
2. Reuse/commercial-use status and any restrictions.
3. Data dictionary and independent meanings for headquarters, recipient, worksite,
   establishment, and place of performance.
4. Update cadence, pagination/export mechanism, rate limits, and outage behavior.
5. Stable source record ID or deterministic fingerprint.
6. Bounded test batch with record counts, failure isolation, archive checksum, and
   duplicate/revision behavior.
7. Freshness and coverage limitations shown in the public matrix.

The matrix defaults to `planned`/`unverified`; those are meaningful states, not missing
data to be guessed.
