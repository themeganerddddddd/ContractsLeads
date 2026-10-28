# Location-Based Business Change Intelligence

Status: implementation candidate on `feature/company-intelligence-v1`. The migration and collector have not been run against production.

## Product architecture

The central query is **what is changing in this market?** The implementation keeps six objects separate:

1. **Company** — a legal or reviewed organization. It can exist without a known physical establishment and can have many establishments.
2. **Establishment** — one public operating location, with its own status and append-only address history. A recipient address and a contract place of performance are not automatically establishments.
3. **Event** — a source-backed statement about a business or location, with an explicit status such as announced, underway, opened, completed, or closed.
4. **Signal** — normalized evidence that may support a change assessment. A permit, license, WARN notice, or government award remains a signal unless the source explicitly establishes an outcome.
5. **Outcome** — a versioned, evidence-backed historical label such as `establishment_opened` or `establishment_closed`. Outcomes are suitable for future point-in-time validation.
6. **Assessment** — a deterministic, dated indication built from signals. `business-change-indication-v1` produces evidence-strength bands, never probabilities.

The additive `0015_location_business_change.sql` migration creates establishments, address history, licenses with append-only source versions, establishment events and evidence, normalized signals, evidence groups, versioned outcomes, assessments, tracked geographies, and a source-coverage matrix. Existing procurement, movement, tracking, and company-change tables remain intact.

## User experience

- `/business-change` starts with geography and supports state, county/FIPS, city, ZIP, industry, source family, evidence level, and 7/30/90/365/custom date filters.
- The independently queryable tabs are Opening, Growing, Moving, Closing, Shrinking, and New Businesses.
- Counts use the active server-side database filters.
- Result cards identify who, what changed, where, when, evidence strength, and source links.
- Confirmed outcomes, source events, registrations, and indications remain visibly labeled.
- The map renders only source-provided precise coordinates for public operating locations. City- and county-level records remain in the list and never receive fabricated pins.
- `/establishment/[id]` shows location status, outcomes, indications, signals, events, address history, licenses, and evidence.
- `/data-coverage` discloses geography, availability, reuse, refresh frequency, and limitations.

## Assessment rules

`business-change-indication-v1` is implemented in `movements/business_change.py`.

- Each signal type has a published maximum point contribution.
- Points are multiplied by signal strength, source reliability, match confidence, 180-day recency decay, and geography specificity.
- Duplicate source facts and shared evidence groups count once.
- Strong indications require at least two source systems and two evidence families.
- A single license, permit, registration, WARN record, contract, deobligation, or contract loss cannot establish a physical outcome.
- A relocation destination is displayed only when both origin and destination evidence exist.
- Bands are Strong (70+), Moderate (40–69.9), Early (below 40 with evidence), and Insufficient evidence.
- A numeric score is evidence strength out of 100, not a probability.

Calibrated opening, closing, growth, contraction, relocation, and formation probabilities remain disabled until versioned outcomes, point-in-time feature snapshots, chronological validation, and sufficient positive examples exist.

## First business-license source

The first implemented source is the official District of Columbia **Basic Business License in Last 30 Days** ArcGIS Feature Service:

- Official dataset: <https://opendata.dc.gov/datasets/a9ac9f8d9d1546e8bd6610b48cb29810>
- Feature layer: <https://maps2.dcgis.dc.gov/dcgis/rest/services/FEEDS/DCRA/FeatureServer/1>
- Publisher: DC Department of Licensing and Consumer Protection
- Update frequency: daily
- Reuse: Creative Commons Attribution 4.0, as reported by the official ArcGIS item metadata
- Stable identifiers: `GLOBALID`, `OBJECTID`, and customer number are available; normalization prefers `GLOBALID`
- Useful fields: status, initial issue/start/end dates, activity, category, entity/trade name, entity type, official premise, DC geography, and MAR ID

Privacy and inference controls:

- The API request uses an explicit field allowlist.
- Owner, registered-agent, billing, and property-owner fields are never requested or persisted.
- Residential-rental and home-occupation premises are suppressed; only coarse city/state geography remains.
- A source premise can create an unresolved establishment candidate but never a headquarters claim.
- Name-only matching to a procurement company is not attempted.
- A license creates an opening signal, not an `establishment_opened` outcome.
- Coarse rounded latitude/longitude values are discarded.

A read-only bounded validation on 2026-10-27 fetched 25 active license rows: 7 passed the conservative public-operating-premise filter, 18 had premises suppressed, 0 had coordinates precise enough for a pin, and 0 private owner/agent/billing fields were retained. This was an adapter check only; it was not persisted and is not a production record count.

## Maryland, Virginia, and aggregate benchmark research

| Source | Geography | Status | Reuse/access decision | Frequency | Limitation |
|---|---|---|---|---|---|
| DC Basic Business License, last 30 days | DC | Available, adapter implemented | CC BY 4.0 with attribution | Daily | A license is not proof an establishment opened; only a rolling 30-day issued-license view. |
| Maryland SDAT corporate file | Maryland | Unsupported for this release | Official bulk files are sold through a contractor; no current free machine-readable API and commercial redistribution permission was verified | Weekday search updates | Do not scrape the entity-search page. Official services page: <https://dat.maryland.gov/Pages/Services.aspx>. |
| Virginia SCC Clerk Information System | Virginia | Unsupported for this release | Public search exists, but no verified bulk API/feed or commercial-reuse terms were found | Not verified | Do not scrape. Official FAQ: <https://www.scc.virginia.gov/businesses/business-faqs/cis-faq/>. |
| DC Corporate Registration | DC | Planned | Official ArcGIS data exists; privacy, history semantics, and field-level reuse validation remain | As published | Beneficial-owner data is deliberately out of scope. |
| Census Business Formation Statistics | US aggregate | Planned benchmark | Official public aggregate statistics | Monthly; annual county data | No named real-time businesses. <https://www.census.gov/econ/bfs/data.html> |
| Census Business Dynamics Statistics | US aggregate | Planned benchmark | Official public aggregate API | Annual | Establishment births/deaths and job dynamics, not named businesses. <https://api.census.gov/data/timeseries/bds.html> |
| BLS Business Employment Dynamics | US aggregate | Planned benchmark | Official public aggregate series | Quarterly and annual | Gross gains/losses and openings/closings, not named businesses. <https://www.bls.gov/bdm/> |

## Operations and validation

No production command should be run from this branch until release approval.

Preview/fresh database sequence:

```powershell
python scripts/manage_db.py migrate
python -m movements license-sync --source dc-basic-business-licenses --limit 25
python -m pytest -ra
cd web
npm test
npm run typecheck
npm run build
```

Post-migration validation must verify:

- residential premises and private fields are absent;
- all rows retain official source URLs;
- one company can retain multiple establishments;
- address updates append history rather than overwrite it;
- signal/outcome counts are reported separately;
- no calibrated probability is displayed;
- query plans use category/date/geography/company/establishment indexes;
- existing `/search`, procurement profiles, tracking, and movement routes remain unchanged.

## Release recommendation

Hold production migration and deployment. The code is ready for a fresh or preview PostgreSQL migration, bounded license ingestion, route testing against that preview data, and a privacy review. Production remains unchanged until those gates pass.
