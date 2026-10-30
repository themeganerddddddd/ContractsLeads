# BusinessCurrent storage projection and cost model

Finalized October 30, 2026 from the October 28 production audit. This is a planning
model, not a promise of record volume or vendor price. Re-run the benchmark after each
new source family and confirm prices before purchasing capacity.

## Measured source payloads

The production query measured JSONB payloads without returning their contents.

| Relation/source | Records | Avg PostgreSQL payload bytes | Avg JSON text bytes | Total PostgreSQL payload bytes |
|---|---:|---:|---:|---:|
| raw_source_transaction_versions / usaspending | 41,433 | 1,452 | 1,419 | 60,158,958 |
| raw_source_transactions / usaspending | 41,292 | 1,452 | 1,419 | 59,960,523 |
| business_license_versions / dc_basic_business_licenses | 50 | 920 | 887 | 46,001 |
| company_event_sources / maryland_commerce_press | 7 | 1,496 | 2,571 | 10,470 |
| company_event_sources / virginia_warn | 25 | 464 | 456 | 11,595 |
| company_event_sources / maryland_warn | 25 | 327 | 319 | 8,183 |
| development_permit_versions / montgomery_county_commercial_permits | 2 | 950 | 951 | 1,900 |

These are representative of the current bounded production batches, not national
volume. Small relations are page-granular and should not be extrapolated from whole-table
size alone.

The local prototype also compressed bounded JSONL batches with deterministic gzip level
9. A 100-record synthetic USAspending fixture compressed 100,252 bytes to 2,745 bytes;
its intentionally repetitive values make the 97.26% ratio unsuitable for forecasting.
The Maryland WARN, Virginia WARN, and Maryland Commerce HTML fixtures compressed by
45.38%, 55.40%, and 60.25% respectively. The planning model therefore uses a more
conservative **45% compressed-size ratio** (object bytes equal 45% of JSON text) rather
than the synthetic USAspending result.

## Old versus new representation

The current USAspending current-row and first-version pair occupies about 4.1 KB per
source transaction across its two raw relations, including current indexes at the
measured population. For a cold historical revision, the new design targets:

- approximately 300–500 bytes of PostgreSQL manifest/pointer/index overhead;
- approximately 639 object bytes for a 1,419-byte average JSON record at the 45% ratio;
- normalized facts, company identities, establishment identities, monthly features,
  source URLs, hashes, and confirmed outcomes retained independently and permanently.

Using the 400-byte midpoint, a cold revision is roughly 1.04 KB across both tiers rather
than about 2.05 KB in the version relation alone: approximately **80% less PostgreSQL
space** and **49% less combined tier space**. Actual savings depend on object batching,
index density, JSON variance, and whether the current copy remains within the hot window.

The production database presently has 78,913,536 bytes of relation data in tables that
the prototype can eventually archive. Because no rows have aged beyond policy cutoffs,
the immediate reclaimable amount is zero. Once rows age out, verified object manifests
must exist before any payload is replaced by an archive pointer. The prototype never
deletes a source row and does not enable automatic pruning.

## Five-year hot / ten-year archive scenarios

For national planning, the model treats each raw observation as:

- 350 bytes of pointer/manifest metadata;
- 250 bytes of PostgreSQL index/tuple overhead;
- 200 bytes of amortized normalized facts (one 1 KB materialized fact per five raw
  observations);
- 1.5 KB uncompressed raw JSON, compressed to 45% (675 bytes) in object storage.

These are explicit assumptions. The capacity script must be rerun with measured values
after the first bounded national batches.

| Scenario | New observations/year | Five-year hot PostgreSQL estimate | Ten-year raw object estimate | Suggested initial SQL capacity |
|---|---:|---:|---:|---:|
| Low | 5 million | 20 GB | 33.75 GB | 25 GB |
| Base | 20 million | 80 GB | 135 GB | 100 GB |
| High | 50 million | 200 GB | 337.5 GB | 250 GB |

The estimates exclude WAL, restore history, temporary query space, and branch deltas.
Maintain at least 20–30% operational headroom and stop historical loads before the
configured 72% threshold.

## Current official storage pricing

Neon published usage-based paid storage at **$0.35 per GB-month** and described Launch
as no-minimum usage pricing; current compute is separately metered. Source:
<https://neon.com/blog/major-compute-price-reduction-on-neon>.

| PostgreSQL capacity | Storage-only estimate/month |
|---:|---:|
| 10 GB | $3.50 |
| 25 GB | $8.75 |
| 50 GB | $17.50 |
| 100 GB | $35.00 |
| 250 GB | $87.50 |

Cloudflare R2 Standard currently lists **$0.015 per GB-month**, 10 GB-month free,
one million Class A operations free, ten million Class B operations free, and free
egress. Source: <https://developers.cloudflare.com/r2/pricing/>. R2 states eleven nines
annual durability for its storage classes: <https://developers.cloudflare.com/r2/buckets/storage-classes/>.

| Raw archive volume | Standard storage estimate/month before operation charges |
|---:|---:|
| 33.75 GB | $0.36 |
| 135 GB | $1.88 |
| 337.5 GB | $4.91 |
| 500 GB | $7.35 |
| 1 TB | $14.85 |

R2 is the cost-model reference, not a provisioned dependency. The implementation is
S3-compatible and remains portable to AWS S3, Backblaze B2, and other compatible
providers. Provider selection must include encryption, versioning/immutability,
retention, access logging, restore testing, account ownership, and lifecycle review—not
price alone.

## One-time conversion plan

1. Apply migration 0016 in a non-production branch and validate table/index growth.
2. Configure a versioned S3-compatible bucket without placing credentials in the repo.
3. Run `retention-plan` read-only and confirm source dates, row counts, and projected
   object bytes.
4. Archive a bounded batch, independently read it back, verify SHA-256, and commit the
   manifest and row pointers.
5. Exercise restore by resolving pointers and comparing hashes/content counts.
6. Leave PostgreSQL payloads intact until their hot-retention window expires and the
   archive is verified. Do not delete source rows.
7. Only after a separate production change review may payload pruning be enabled for
   rows that are not sole outcome evidence.

At current ages, steps 1–5 provide durability validation but no immediate space savings.
That is the correct result; retention age is not inferred from award dates or fabricated.
