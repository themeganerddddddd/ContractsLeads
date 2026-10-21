# Global procurement and intelligence validation

Generated: 2026-10-20

This report records a bounded live-source validation and a real local-history backtest attempt. It does not extrapolate beyond records actually loaded.

## Database inventory

- Official awarded legal entities: 229 (228 previously loaded U.S. entities plus 1 UK supplier)
- Demonstration companies: 4
- Official U.S. awards: 775
- Official U.S. transactions: 791
- U.S. procurement processes: 781 total (775 official, 6 demo)
- UK procurement processes: 1 official
- Official U.S. lifecycle events: 827
- Demonstration U.S. lifecycle events: 17
- Official UK lifecycle events: 2

## Find a Tender bounded validation

Command window: `2025-01-01` through `2025-01-01`, limit 20.

- Releases received: 1
- Distinct releases written on first run: 1
- Processes written: 1
- Events written: 2 (`award_announced`, `contract_signed`)
- Immediate rerun: 1 release received, 0 written, 1 duplicate
- Observed source coverage in this database: 2025-01-01 through 2025-01-01
- Native value: GBP 212.57
- USD value: null because no auditable FX observation was supplied
- Companies House identifiers observed in this bounded release: 0
- Other source identifiers observed: 1

The small result is a bounded pipeline validation, not a claim about UK archive coverage.

## U.S. lifecycle derivation

The idempotent historical migration grouped all 781 existing U.S. awards into procurement processes and derived source-linked events from the uncollapsed transaction history:

| Event | Count |
|---|---:|
| Award announced | 781 |
| Contract modified | 18 |
| Contract started | 6 |
| Option exercised | 1 |
| Value decreased | 23 |
| Value increased | 15 |

These totals include 17 events on the six clearly labeled demonstration awards. Model candidate selection excludes demonstration and benchmark entities.

## Real historical backtest result

Two versioned candidate models were evaluated against the official event history:

| Model | Training snapshots | Out-of-time test snapshots | Positive test outcomes | Probability eligible |
|---|---:|---:|---:|---|
| New Award, 90 days | 6,156 | 0 | 0 | No |
| Contract Change, 90 days | 20,925 | 0 | 0 | No |

Both versions are persisted as `insufficient_history`. The local U.S. official transactions cover only one action date (2022-01-02), and the single UK release cannot provide a forward outcome window. No model metrics were invented: ROC AUC, PR AUC, Brier score, log loss, precision, recall, and calibration buckets remain absent because the out-of-time test set is empty.

- Append-only prediction rows written: 3,015
- Rows with a displayed probability: 0
- Rows marked `insufficient_history`: 3,015
- Momentum snapshots: 229 total; 60 sufficient descriptive scores and 169 insufficient-history results

Government Momentum is a descriptive 0–100 activity index and is not used as a probability.

## Verification

- Python tests: 100 passed against the migrated PostgreSQL database
- Web tests: 24 passed
- TypeScript: passed
- Next.js production build: passed, including `/process/[id]`, `/admin/models`, and `/api/company-watches`
- Runtime HTTP checks: UK search, UK process, UK company, U.S. contract, model audit, and UK search API all returned 200
- Watch flow: authenticated development POST returned 201 and inserted one row; the verification row was removed afterward

## Limitations

- A calibrated probability model cannot be activated until a multi-year official history provides genuine point-in-time training and out-of-time outcomes.
- The UK validation is intentionally one release. Run broader explicit windows before making coverage claims.
- The first international adapter is UK Find a Tender only.
- Cross-country corporate-family mappings require analyst review and independent evidence; none were created automatically.
- Non-USD records do not receive USD values until a dated, source-linked FX adapter is implemented.
