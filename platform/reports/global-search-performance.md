# Global search performance check

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` was run against the live production
database on 2026-10-22 after the bounded imports. These timings are warm-cache
observations at the present small dataset, not future-scale guarantees.

| Query path | Planning | Execution | Returned | Shared reads |
|---|---:|---:|---:|---:|
| U.S. keyword search (`software`, 20 rows) | 4.923 ms | 239.635 ms | 20 | 2 |
| TED market + buyer country + CPV | 0.133 ms | 0.096 ms | 4 | 0 |
| UK recent processes | 0.102 ms | 0.743 ms | 20 | 0 |
| Global market counts | 0.084 ms | 9.567 ms | 3 | 0 |
| Prediction-filter path (no eligible rows) | 0.238 ms | 0.050 ms | 0 | 0 |
| Buyer profile recent procedures | 0.353 ms | 0.099 ms | 4 | 0 |
| TED process profile with notices/lots/contracts | 0.811 ms | 0.196 ms | 1 | 0 |

All representative paths remained below the 500 ms investigation threshold.
The U.S. full-text path rose to 239.635 ms while the scheduled incremental sync
was writing; the other paths remained below 10 ms. Market/date, process, buyer,
notice, lot, contract, GIN text, CPV, country, and NUTS indexes are present.
Re-run the same plans after every large historical chunk; current timings must
not be extrapolated to the projected multi-million-record corpus.
