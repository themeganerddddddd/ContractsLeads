# Company tracking product

Federal Ledger now models three related but separate concepts:

- **Platform monitor target:** an exact canonical legal entity deliberately selected for ongoing Federal Ledger monitoring in `company_monitor_targets`.
- **Discovered company:** a company or unresolved observed name surfaced by a source event in `company_discoveries`; pending and ambiguous evidence remains reviewable and does not silently become authoritative.
- **User watch:** a signed-in customer's future/personal selection in the unchanged `company_watches` table.

One company identity may have a platform target and multiple user watches without duplicating the `companies` row. Corporate-family tracking remains off by default; legal entities are monitored independently.

## Product flow

```text
source-oriented collector or procurement ingestion
    -> canonical source event
    -> identifier/entity resolution
    -> authoritative/reviewed link OR match-review queue
    -> discovered-company record
    -> exact analyst selection
    -> platform monitor target
    -> per-source evaluation state
    -> deduplicated in-app alert
```

`python -m movements monitor-tracked` reads canonical procurement, movement, permit, and SEC event tables. It does not call USAspending, Find a Tender, or TED once per company. One failed source-family evaluation is recorded on that target and does not stop the other source families.

## Public beta routes

- `/tracked-companies`: active/paused platform targets, identifiers, recipient geography, latest source-backed changes, 7/30-day activity, sorting, and filtering.
- `/discovered-companies`: why a company was surfaced, source, date, match status, evidence, and tracking state.
- `/alerts`: new/seen deduplicated platform alerts with contract, movement, permit, SEC, company, and market context.
- `/admin/company-match-reviews`: internal-token analyst search, exact entity selection, discovered-company promote/review/dismiss actions, target lifecycle/priority/source-family controls, and audited approve/reject actions.
- `/company/[slug]#intelligence-timeline`: a chronological query over canonical procurement, movement, SEC, and reviewed permit relationships. No duplicate timeline-event table exists.

When authentication is disabled, platform tracking remains public and the profile states that personal watchlists are coming soon. It does not render a button that can only return 401.

## Evidence and safety boundaries

- Procurement events remain procurement events. A contract never becomes an expansion, relocation, facility, or hiring event.
- Movement alerts require `auto_verified` or analyst `approved` relationships. Pending relationships can be displayed with an accurate pending label but cannot create tracked-company alerts.
- Permit alerts and timeline rows require an `auto_verified` or analyst-approved permit-company relationship. Address proximity and pending name matches are never enough.
- SEC evaluation requires a verified CIK; otherwise source state says that the identifier is required. Fuzzy CIK resolution is not performed.
- U.S. procurement is nationwide. UK and EU/TED coverage includes records linked to the exact legal entity. WARN is currently Maryland and Virginia only; expansion announcements are Maryland only; permits are Montgomery County only.
- Descriptive early indications remain separate from predictions. Probability output stays unavailable unless an independently validated model passes existing calibration gates.

## Saved searches and regions

The existing saved-search JSON architecture preserves company geography, performance geography, industry, agency, signal type, event date, and market as separate keys. Daily or weekly authenticated saved searches are evaluated after discovery materialization; matches persist as deduplicated private `saved_search_match` or `region_event` rows. Public `/alerts` excludes user-owned alert rows. This branch does not claim that the evaluator has run against a migrated database. This phase does not enable outbound delivery or collapse “companies based in an area” into “work performed in an area.”

## Deployment boundary

Migration `0013_company_tracking_product.sql` is additive and leaves `company_watches`, procurement history, movement history, and source evidence intact. Do not run it in production until the backup, direct credential, migration, bounded-ingestion, match-review, preview-database, and record-backed smoke-test gates are satisfied.
