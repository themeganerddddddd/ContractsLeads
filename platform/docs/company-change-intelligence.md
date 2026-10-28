# Company change intelligence

Federal Ledger keeps three products separate:

1. **Observed outcomes** are source-backed facts stored in `company_outcomes`. Every label has an outcome-definition version, source system, exact source URL, verification state, evidence, and first-observed timestamp.
2. **Early indications** are deterministic 0–100 evidence scores stored in `movement_assessments` under `company-change-indication-v2`. They are not probabilities. Components show the maximum points, effective points, reliability, strength, confidence, recency factor, source family, and evidence URL.
3. **Validated predictions** use `prediction_models` and `company_change_predictions`. A probability is null unless a chronological out-of-time backtest passes the existing sample, outcome, discrimination, baseline, and calibration gates.

Existing `movement-indication-v1` rows are retained and are never reinterpreted as v2 scores.

## Outcome definitions

Definitions are versioned in `outcome_definition_versions`.

- Expansion requires a verified facility, job-creation, operating-location, market-entry, or expansion-linked investment fact. A contract award or funding event alone is not expansion.
- Relocation requires a verified company event and both an origin and destination geography. A new facility without an evidenced origin move is expansion or market entry.
- Growth is a sustained trajectory label. A single award does not qualify.
- Contraction includes source-backed layoffs, closures, consolidations, material downsizing, bankruptcy, or restructuring. A single deobligation does not qualify.
- Formation requires a new legal entity in an official, legally usable registration source. It may remain unresolved from a canonical company.

`outcomes-build` reads only approved or auto-verified company relationships, verified/corroborated events, and non-rejected official registrations. `outcomes-validate` checks source provenance, company-unit integrity, and relocation geography.

```powershell
cd platform
python -m movements outcomes-build
python -m movements outcomes-validate
```

## Indication rules

The point caps live in `movements/change_intelligence.py`. Each contribution is:

```text
maximum points × signal strength × source reliability × match confidence × 180-day time decay
```

Duplicate facts share an evidence key and count once. A strong score requires at least two independent source families and two signal families. One source can produce a limited or moderate score but is capped below the strong threshold. Federal procurement and official funding are supporting components: they cannot independently establish physical expansion, relocation, or contraction.

Relocation scoring records origin-pressure and destination-pull evidence separately. The interface displays a possible destination only when both origin and destination evidence are present.

```powershell
python -m movements assess --assessment-type expansion
python -m movements assess --assessment-type relocation
python -m movements assess --assessment-type growth
python -m movements assess --assessment-type contraction

# Explicit legacy reproduction only; writes movement-indication-v1.
python -m movements assess-v1 --assessment-type growth
```

Alerts require a 15-point increase or a crossing into the 40/70 bands. One-point changes do not alert.

## Formation activity

`business_registrations` preserves official entities before canonical-company resolution. `formation_activity_snapshots` is keyed by geography × industry × month. Its immediate `business-formation-activity-v1` output is a descriptive activity score, not a probability. Without official registration counts the score is null even when contextual permits or awards exist.

```powershell
python -m movements formation-build --as-of 2026-10-01
```

The nationwide registration adapter interface exists, but no adapter is enabled until official access and commercial reuse are verified. Raw redistribution restrictions must be honored; normalized facts still retain source provenance.

## Point-in-time prediction framework

Prepared model types and units:

| Model | Unit | Horizons |
|---|---|---|
| `company_expansion` | company | 90, 180, 365 days |
| `company_relocation` | company | 90, 180, 365 days |
| `company_growth` | company | 90, 180, 365 days |
| `company_contraction` | company | 90, 180, 365 days |
| `business_formation` | geography × industry | 3, 6, 12 months |

`company_change_feature_snapshots` records the cutoff and latest observation time by source. The feature builder rejects records observed or occurring after the cutoff. Formation predictions never require a `company_id`.

Backtests use historical training, a later validation period, and a later untouched test period. They use the existing auditable logistic baseline and report sample counts, positives/negatives, base rate, ROC AUC, PR AUC, Brier score, log loss, precision, recall, calibration buckets, false-positive/negative rates, and median lead time. Geography and relocation-destination accuracy remain null until the corresponding label volume exists.

```powershell
python -m intelligence change-backtest --type company_expansion --training-end 2024-06-30 --validation-end 2024-12-31 --test-end 2025-06-30 --horizon 180
python -m intelligence change-backtest --type business_formation --training-end 2024-06-30 --validation-end 2024-12-31 --test-end 2025-06-30 --horizon 6
```

The expected first result is `insufficient_history`, with `probability_eligible=false`. That state is persisted for audit and the UI says “Not available — insufficient validated history.”

## Signal coverage

Coverage is stored in `signal_source_coverage` using `implemented`, `available`, `unsupported`, `licensing_blocked`, or `insufficient_coverage`.

| Family | Current state |
|---|---|
| Procurement | Implemented nationwide for federal activity; not proof of physical change |
| Workforce reductions | Implemented for Maryland and Virginia official WARN sources |
| Hiring | Unsupported; no permissible current nationwide feed configured |
| Facilities/property | Implemented for Montgomery County permits; insufficient nationwide coverage; party role does not prove occupancy |
| Corporate | SEC interface implemented for verified CIKs; filing facts do not prove expansion |
| Government/economic development | Maryland official announcements implemented; insufficient nationwide coverage |
| Business registration | Adapter interface implemented; current data source unsupported pending access/reuse review |
| Geography/market context | Unsupported until employment, wages, establishment, vacancy, and cost feeds are configured |

## Real evidence boundary

The bounded official-source validation identified CLYM Environmental Services as a candidate for a Maryland expansion/new-facility observation and Peraton as a candidate for workforce-contraction evidence. Both are name-based pending-review candidates in the checked-in validation report, not verified canonical outcomes. BAE Systems remains ambiguous. No supported origin-and-destination relocation example was found, so none is presented.
