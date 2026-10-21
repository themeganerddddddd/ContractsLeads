# Federal Ledger query benchmark

Generated: 2026-10-14T02:30:40.842825+00:00

Inventory: {'companies': 12732, 'awards': 34115, 'transactions': 100799, 'database_bytes': 127507479, 'database_size': '122 MB'}

Environment: local PostgreSQL 16 in Docker on Windows; hardware was not normalized. This run added 12,500 clearly marked synthetic companies, 33,334 awards, and 100,000 transactions in 319.778 seconds (312.72 transactions/second). The remaining 232 companies, 781 awards, and 799 transactions were the bounded official-source validation plus demonstration rows. Synthetic rows were removed after these plans were recorded. Adding `awards_title_description_search_idx` reduced the measured contract text-search plan from 145.172 ms to 38.082 ms on the same loaded dataset.

| Query | Execution ms | Root node | Indexes |
|---|---:|---|---|
| home_overview | 30.379 | Aggregate | companies_pkey |
| recent_awards | 17.528 | Limit | none |
| largest_awards | 11.682 | Limit | none |
| contract_text_search | 38.082 | Limit | awards_title_description_search_idx, companies_pkey |
| company_search | 5.333 | Limit | awards_recipient_company_idx, companies_name_trgm_idx |
| recipient_county_filter | 10.593 | Aggregate | companies_recipient_county_idx |
| performance_county_filter | 6.996 | Aggregate | awards_performance_county_idx, companies_pkey |
| date_range_filter | 3.094 | Aggregate | awards_award_date_idx |
| company_profile | 0.178 | Aggregate | awards_recipient_company_idx, companies_slug_key, transactions_award_idx |
| location_flows | 17.356 | Aggregate | none |
| agency_contractors | 4.847 | Limit | awards_agency_date_idx, companies_pkey |
| industry_profile | 11.438 | Limit | awards_primary_industry_idx |
| transaction_history | 3.729 | Sort | transactions_award_date_idx |
