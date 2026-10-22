# Global search performance check

`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` was run against the live production
database on 2026-10-22 after the bounded imports. These timings are warm-cache
observations at the present small dataset, not future-scale guarantees.

| Query path | Planning | Execution | Returned | Shared reads |
|---|---:|---:|---:|---:|
| U.S. keyword search (`software`, 20 rows) | 1.804 ms | 1.061 ms | 20 | 0 |
| TED market + buyer country + CPV | 0.275 ms | 0.092 ms | 1 | 0 |
| UK recent processes | 0.069 ms | 0.040 ms | 20 | 0 |
| Buyer profile recent procedures | 0.353 ms | 0.099 ms | 4 | 0 |
| TED process profile with notices/lots/contracts | 0.811 ms | 0.196 ms | 1 | 0 |

All representative paths were sub-2 ms in the database and served from shared
buffers. Market/date, process, buyer, notice, lot, contract, GIN text, CPV,
country, and NUTS indexes are present. Re-run the same plans after every large
historical chunk; current timings must not be extrapolated to the projected
multi-million-record corpus.
