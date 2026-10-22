# International procurement architecture

Federal Ledger keeps the existing USAspending award and transaction model intact and adds a source-neutral procurement-process layer beside it. A process represents the lifecycle known to one official publishing system; source releases and events are append-only evidence attached to that process. `source_market` identifies the publishing market (`US_FEDERAL`, `UK_FTS`, or `EU_TED`); it never substitutes for the actual buyer, supplier, or performance country.

## Identity boundaries

- `companies` remains an awarded legal entity. A legal entity can have many source identifiers in `entity_identifiers`.
- `organizations` is an optional reviewed corporate family. A company is never attached to an organization by name alone. `organization_company_mappings` records the review status, method, reviewer, and evidence.
- Recipient address, place of performance, and organization headquarters are different fields. A source recipient address is not evidence of headquarters.
- Global supplier resolution uses explicit source identifiers first. If none exists, the adapter creates a source/process-scoped OCDS party identifier rather than merging on a similar name.

Supported identifier labels are open-ended and include UEI, CAGE, Companies House (`GB-COH`), ABN, NZBN, UEN, VAT, LEI, OCDS party IDs, and source-native IDs.

## Source adapter contract

Every country integration implements the `ProcurementSourceAdapter` boundary in `ingestion/adapters.py`:

1. `fetch(window)` retrieves official source envelopes and follows the source's pagination.
2. `normalize(envelope)` maps native releases into a process, buyers, legal suppliers, classifications, and events without inventing missing values.
3. `checkpoint(envelope)` returns a restart-safe source position.
4. Persistence deduplicates immutable release versions by source release ID plus payload hash and events by a stable fingerprint.

An adapter failure is recorded in `source_checkpoints`; independently scheduled sources are not rolled back or blocked.

## United Kingdom: Find a Tender

The first international adapter is `ingestion/uk/`. It reads the official unauthenticated Find a Tender release-package endpoint:

```text
https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages
```

The API publishes OCDS 1.1 release packages and supports `updatedFrom`, `updatedTo`, `limit`, and cursor pagination. Run a bounded or historical window with:

```powershell
cd platform
python -m ingestion uk-sync --start 2025-01-01 --end 2025-01-31 --limit 100
```

Use `uk-backfill` for historical windows so capacity is checked between
restartable chunks:

```powershell
python -m ingestion uk-backfill --start 2025-01-01 --end 2025-03-31 --window-days 7
```

Omit dates for the most recent two-day overlap. Re-running a window is safe. The adapter groups releases by OCID, retains every distinct release payload, extracts buyers and all disclosed suppliers, preserves Companies House and other native identifiers, maps CPV prefixes to the common industry taxonomy, and derives lifecycle events from OCDS release tags.

GBP remains GBP in `value_native`. `value_usd` is null unless the same row includes an explicit FX rate, observation date, and source URL. The initial adapter deliberately does not bundle an FX provider.

## European Union: Tenders Electronic Daily

`ingestion/eu_ted/` integrates the official public TED Search API v3 for daily
collection and official monthly XML reuse packages for controlled historical
loading. Search API paging uses `ITERATION`, not the 15,000-result page-number
ceiling. The adapter preserves notice UUID and version, publication number,
procedure UUID, notice/change references, buyer and tenderer identifiers,
CPV, lot and contract identifiers, actual countries, NUTS values when supplied,
native amount/currency, the exact notice URL, and XML URL.

```powershell
python -m ingestion eu-sync --start 2026-10-15 --end 2026-10-21 --limit 250 --historical
python -m ingestion eu-backfill --year 2025 --month 1 --max-records 250
```

Notice versions are immutable rows in `procurement_notices`; lots and contracts
are durable linked entities. Planning notices without a procedure UUID receive
a source-scoped process container and remain explicitly unlinked rather than
being guessed onto a later procedure. eForms and legacy XML parsers retain null
for missing facts. EU is never treated as a country in search: the UI first
filters by the `EU_TED` market, then by actual buyer/supplier/performance country.

## Extending to another country

Add a package under `ingestion/<country>/`, implement the adapter protocol, register the official source in `data_sources`, and send normalized records to `PostgresRepository.ingest_global_release`. Add normalization, identifier, lifecycle, pagination, and duplicate-release tests before scheduling it. Never encode country-specific supplier identity logic in the shared repository.

## Coverage and quality

`data_sources` exposes country, official URL, license, observed coverage, update frequency, latest successful run, record count, and quality state. Coverage dates describe records actually observed locally; they are not claims about the publisher's entire archive.
