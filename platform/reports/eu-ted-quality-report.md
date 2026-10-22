# EU TED bounded-sample quality report

Production sample: publication dates 2026-10-15 through 2026-10-21, capped at
250 notices. The cap makes coverage intentionally partial. The TED Search API
reported 18,723 notices for the full seven-day window.

## Results

- 250 immutable notice versions across 248 procedure containers.
- 1,151 lot identifiers, 1,077 contract identifiers, 250 source-release
  records, 250 lifecycle events, and 132 distinct normalized suppliers.
- 250/250 notice IDs and publication numbers present.
- 250/250 exact HTTPS notice links and XML links present.
- No duplicate `(notice ID, version, payload hash)` rows.
- Four notices lacked a procedure UUID and remain explicit source-scoped
  planning containers; they were not guessed onto another procedure.
- 157/248 procedures had no disclosed result value and 154/248 had no currency;
  those fields remain null. No FX conversion was invented.
- The sample's observed buyer-country and CPV fields were present on all 248
  procedure containers. Multi-lot field arrays are retained in raw provenance;
  values are not assigned to individual lots unless a one-to-one mapping is
  available.

TED eForms notice codes are mapped explicitly: `pin-*` to planning,
`cn-*` to tender publication/change, `can-*` to award publication,
`can-modif` to contract modification, and VEAT to award announcement. Unknown
codes remain `other`. The raw notice, notice type/subtype, change reference,
and source link remain available for audit.

## Constraints

The sample is one bounded Search API slice, not historical completeness. The
monthly XML path and both eForms/legacy parsers are implemented, restartable,
and capacity guarded, but no monthly package was loaded because the capacity
projection failed. Full per-lot address/date semantics should be validated on
another bounded XML sample after storage is expanded.
