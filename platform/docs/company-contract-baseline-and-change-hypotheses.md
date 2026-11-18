# FirmQuarry: Company procurement baselines as early change signals

**Status:** Descriptive research feature in draft PR #9. These comparisons are not validated expansion, contraction, or relocation forecasts.

## Question

Is a company receiving more or less government business than normal for *that company*, and does newly observed activity in unfamiliar geographic markets justify follow-up research?

## First-pass implementation

- **Recent window:** Last 12 months of U.S. transaction **net obligations** (including negative adjustments), plus counts of newly dated distinct award records.
- **Historical benchmark:** Annualized average across the **preceding 36 months**, excluding the recent 12-month window. This takes 48 months of observation to compare the current year against a full 3-year baseline.
- **Sufficiency:** Report directional changes only if the company's earliest recorded transaction is at least 48 months old and the historical annual average is positive. This is a *minimum indicator*, not proof that the source covered every month; verify ingestion start/end dates as the product matures.
- **Heuristic directional cue:** 12-month total is **at least 25% and $250,000 above** normal, or **at least 25% and $250,000 below** normal. Both thresholds must hold. These are transparent initial research parameters, not empirically calibrated cutoffs.
- **Geographic cue:** Highlight newly awarded contract **performance states** in the last 12 months that were not present on the company's awards in the preceding 36 months, excluding the recipient state. Performance geography is neither a verified operating location nor evidence of intent to relocate.
- **Cross-category controls:** Directory, Expansion, Retention and Movement screens share minimum recent obligations (USD), minimum prior-3-year annual baseline (USD), and an above/below-baseline filter.
- **Company contacts:** Show a professional procurement contact only when explicitly linked by **exact UEI** to an official public SAM.gov or GSA eLibrary source. Never infer an email address, phone number, decision-maker identity, or contact from a parent/subsidiary. The separate licensed PitchBook contact export is not republished.

## Scientific/operational caveats

1. **Count awards, not changes.** One original award can have dozens of modifications. Count distinct contract awards separately from transaction actions; use net incremental obligations rather than adding every cumulative ceiling.
2. **Contract durations differ.** A three-year comparison is a user-configurable working hypothesis, not a universal three-year federal contract cycle. Base/option years, five-year IDIQs, task orders, and agency budgets create spikes; assess by contract type and end dates before inferring business condition.
3. **Treat negative obligations carefully.** Deobligations may be administrative, year-end closeout, or a completed obligation—not lost revenue.
4. **Separate government business from revenue.** Obligations are neither sales nor recognized revenue; firm-wide revenue can grow while a federal contract series declines.
5. **Differentiate *retention risk* from proof.** Declining contracts may justify outreach only when combined with workforce/WARN, leases, financial statements, agency recompete losses, permits, hiring and other independently verified evidence.
6. **Distinguish work destination from company destination.** An outside-state contracting agency, investor, customer or contract performance location does not establish a move. Source-backed relocation evidence requires planned or verified facilities, permits, WARN, leases, state incentives or company announcements tied to that entity.
7. **Private capital:** Monitor sourced financing events and amounts against the firm's own funding history separately from U.S. procurement dollars. Do not combine dissimilar currencies or convert investor geography directly into predicted relocation geography.
8. **Missing ≠ zero.** Source outages, late disclosures, company entity changes, UEI matching, acquisitions and fiscal year timing require separate coverage checks.

## Next-generation model (not deployed by this PR)

- Monthly company-year panel: `new_awards`, `new_orders`, `net_obligations`, `contract_expiration`, `winning_agencies`, `new_agencies`, `new_performance_regions`, `sector`, `contract_type`, `source_coverage`.
- Baseline options: 12/24/36/60 months, full cycles by type, robust median and same fiscal quarter normalization; a peer (NAICS/size) benchmark *in addition* to the company's own historical average.
- Contrast **outcomes** by type: verified new facility/expansion, closure/layoff/contraction, verified actual moves. Train distinct models against dated event labels, backtest chronologically, calibrate probabilities by geography/industry and reject weak cohorts.
- Show a **risk/research indicator** until that validation succeeds, never a forecast probability. Use multiple independent signals and contextual evidence.

**Primary data definitions:** USAspending Analyst's Guide and API (https://www.usaspending.gov/federal-spending-guide), GAO Federal Procurement Data Quality report GAO-25-107469 (https://www.gao.gov/products/gao-25-107469), and FAR indefinite-delivery contracts (https://www.acquisition.gov/far/subpart-16.5).
