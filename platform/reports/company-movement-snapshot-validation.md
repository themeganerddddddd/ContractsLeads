# Company movement snapshot validation

Generated: 2026-10-24T02:24:23.854309+00:00

> This is a non-production comparison of bounded live official movement sources against the checked-in production contract snapshot. It does not prove that migration 0012 or these records are present in the production database.

## Match summary

- Procurement companies: 3000
- Movement events reviewed: 207
- Authoritative identifier-matched events: 0
- Unique name candidates pending review: 10
- Ambiguous events: 54
- Unmatched events: 143
- Candidate-linked company profiles: 8

## Source runs

| Source | Received | Normalized | Failed | Status |
|---|---:|---:|---:|---|
| maryland_warn | 100 | 100 | 0 | success |
| virginia_warn | 100 | 100 | 0 | success |
| maryland_commerce_press | 7 | 7 | 0 | success |

## Cross-source company examples

| Company | UEI | Procurement records | Movement events | Types | States | Match status | Evidence |
|---|---|---:|---:|---|---|---|---|
| PERATON INC. | ZBPQEJVECCT4 | 1 | 3 | layoff | MD, VA | pending_review | [source 1](https://virginiaworks.gov/im-an-employer/retain-and-grow/warn-notices/) [source 2](https://www.labor.maryland.gov/employment/warn.shtml) |
| CHARLES RIVER LABORATORIES, INC. | NAPSK1UAMAE5 | 11 | 1 | closure | MD | pending_review | [source 1](https://www.labor.maryland.gov/employment/warn.shtml) |
| HENDALL INC | P83UA59FQ9V8 | 4 | 1 | layoff | MD | pending_review | [source 1](https://www.labor.maryland.gov/employment/warn.shtml) |
| TEKSYNAP CORPORATION | C2T2JWN1D2K4 | 4 | 1 | layoff | VA | pending_review | [source 1](https://virginiaworks.gov/wp-content/uploads/2026/08/TekSynap-Corporation-Virginia-Works-Rapid-Response-Program-WARN-Notice.pdf) |
| FEDERAL EXPRESS CORPORATION | EM7LMJJCF6B7 | 2 | 1 | layoff | MD | pending_review | [source 1](https://www.labor.maryland.gov/employment/warn.shtml) |
| CLYM ENVIRONMENTAL SERVICES LLC | HWMURUCGRPJ5 | 1 | 1 | new_facility | MD | pending_review | [source 1](https://commerce.maryland.gov/press-room/clym-environmental-services-expansion-allegany-county-75-new-jobs-maryland) |
| KAY AND ASSOCIATES, INC. | NHQJPMYJEVJ9 | 1 | 1 | layoff | VA | pending_review | [source 1](https://virginiaworks.gov/wp-content/uploads/2026/10/Kay-and-Associates-Inc.pdf) |
| KBR WYLE SERVICES, LLC | HYBLSJAMM2F4 | 1 | 1 | layoff | VA | pending_review | [source 1](https://virginiaworks.gov/wp-content/uploads/2026/05/KBR-Wyle-Services-LLC-WARN.pdf) |

## Interpretation

Name-only candidates are deliberately not counted as authoritative matches. They demonstrate that the two source families can be joined for review, while preserving the requirement for verified identifiers or reviewed corporate evidence before an automatic company-level indicator is created.
