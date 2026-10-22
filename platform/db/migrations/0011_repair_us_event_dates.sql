-- Earlier event derivation accepted date/datetime objects but treated ISO date
-- strings as missing. Repair from the canonical transaction fields.
UPDATE procurement_events e
SET event_at=COALESCE(t.action_date::timestamptz,t.source_last_modified,t.created_at)
FROM transactions t
WHERE e.source_system='usaspending'
  AND e.raw_source_id=t.source_transaction_id
  AND e.event_at IS DISTINCT FROM COALESCE(t.action_date::timestamptz,t.source_last_modified,t.created_at);
