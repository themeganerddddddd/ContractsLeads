-- Missing publisher values remain null. The scoped key is only a database
-- identity aid and is explicitly labelled when it is not a source identifier.
ALTER TABLE buyers ALTER COLUMN name DROP NOT NULL;
ALTER TABLE buyers ADD COLUMN IF NOT EXISTS source_identity_is_synthetic boolean NOT NULL DEFAULT false;
UPDATE buyers
SET name=NULL,source_identity_is_synthetic=true
WHERE source_system='eu_ted' AND name='Buyer not supplied';
UPDATE buyers SET source_identity_is_synthetic=true
WHERE source_system='eu_ted' AND source_buyer_id LIKE '%:buyer' AND identifier_value IS NULL;
