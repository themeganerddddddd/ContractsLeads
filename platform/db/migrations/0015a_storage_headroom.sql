-- The first bounded production collection reached the Neon Free storage
-- ceiling before assessments could be materialized. Preserve every row and
-- integrity constraint while removing four rebuildable secondary indexes.
--
-- raw_source_transaction_versions_lookup_idx is covered for its leading
-- lookup columns by the table's unique (source, source_transaction_id,
-- payload_hash) index. transactions_award_idx is covered by the composite
-- transactions_award_date_idx. The two remaining indexes accelerate text and
-- historical PIID lookups but are not required for correct results.

DROP INDEX IF EXISTS raw_source_transaction_versions_lookup_idx;
DROP INDEX IF EXISTS awards_title_description_search_idx;
DROP INDEX IF EXISTS transactions_award_idx;
DROP INDEX IF EXISTS award_identity_versions_piid_idx;
