# Explainable predictive intelligence

Federal Ledger produces decision-support indicators, not certainty. It never uses an LLM to assign probabilities. The first implementation is a transparent L2-regularized logistic regression written in Python, with its exact feature order, coefficients, standardization values, intercept, data boundaries, metrics, and provenance stored in `prediction_models`.

## Outputs

- **New Award:** probability that an awarded legal entity receives an observed award in 30, 60, or 90 days.
- **Contract Change:** probability that an observed contract or process receives a modification, value change, or option exercise in 30, 60, or 90 days.
- **Renewal / recompete:** schema and UI are ready, but activation requires an independently validated outcome definition and adequate end-date history.
- **Observed-activity index (0–100):** a descriptive activity index, never a probability. It combines event recency, recent volume, contract actions, buyer breadth, and positive value trend.

## Point-in-time safeguards

For a cutoff date, feature generation only reads events with `event_at <= cutoff`. Labels only read qualifying events where `cutoff < event_at <= cutoff + horizon`. Training, validation, and test boundaries must be strictly increasing. The backtest test set begins after the validation boundary, so a future event cannot enter a historical feature snapshot.

Current features are intentionally simple and auditable:

- New Award: events in 90/365 days, awards and changes in 365 days, positive value changes, buyer count, recency, and observable-history length.
- Contract Change: events in 90 days, changes and value changes in 180 days, option exercises, recency, days to contract end, and observable-history length.

## Calibration and display gate

A candidate model may emit visible probabilities only when its out-of-time test contains at least 100 samples, at least 10 positive and 10 negative outcomes, ROC AUC of at least 0.55, and a Brier score better than the constant base-rate forecast. Metrics include ROC AUC, PR AUC, Brier score, log loss, precision and recall at 0.5, base rate, and calibration buckets.

Training is restricted to `US_FEDERAL` events until the other markets have independently sufficient history. It also requires at least 365 days represented by successfully completed U.S. historical backfill jobs and 100,000 observed U.S. transactions. If those coverage gates fail, history is shorter than 180 days, training has fewer than 50 samples, the out-of-time set lacks 100 samples with 10 outcomes in each class, or calibration fails, the version is persisted as `insufficient_history` or `rejected`. Its probabilities are null and prediction generation returns `disabled`. Historical predictions are append-only and keyed by model, cutoff, horizon, and entity.

## Commands

Train and run an explicit out-of-time backtest:

```powershell
cd platform
python -m intelligence backtest --type new_award --training-end 2024-06-30 --validation-end 2024-12-31 --test-end 2025-06-30 --horizon 90
python -m intelligence backtest --type contract_change --training-end 2024-06-30 --validation-end 2024-12-31 --test-end 2025-06-30 --horizon 90
```

Generate append-only predictions and sufficient observed-activity snapshots:

```powershell
python -m intelligence predict --type new_award --horizons 30,60,90
python -m intelligence predict --type contract_change --horizons 30,60,90
python -m intelligence momentum
```

Omit explicit boundaries to derive conservative rolling boundaries from the locally observed event range. Review versions at `/admin/models` before trusting or promoting output.

## Current evidence limitation

The production readiness audit on 2026-10-22 found 8,318 official U.S. transactions but zero days certified by a successfully completed historical backfill job. Both New Award and Contract Change therefore persist audited `insufficient_history` versions and generate zero probabilities. All 1,856 U.S. companies evaluated for the observed-activity index lacked the minimum history, so no index rows were persisted. The system does not substitute UK, TED, demo, or benchmark rows for U.S. model validation.
