-- Correct TED eForms notice codes to source-neutral lifecycle events. The
-- fingerprint is based on immutable notice identity/version, not the mapping.
UPDATE procurement_events e
SET event_type=CASE
      WHEN n.notice_type LIKE 'pin-%' THEN 'planning_notice'
      WHEN n.notice_type LIKE 'cn-%' AND n.change_notice_id IS NOT NULL THEN 'tender_changed'
      WHEN n.notice_type LIKE 'cn-%' THEN 'tender_published'
      WHEN n.notice_type='can-modif' THEN 'contract_modified'
      WHEN n.notice_type LIKE 'can-%' OR n.notice_type='veat' THEN 'award_announced'
      ELSE 'other'
    END,
    event_fingerprint=encode(digest(
      concat_ws('|','eu_ted',n.source_notice_id,n.notice_version,'notice-published'),
      'sha256'
    ),'hex')
FROM procurement_notices n
WHERE e.source_system='eu_ted'
  AND e.raw_source_id=n.source_notice_id
  AND COALESCE(e.evidence->>'notice_version','1')=n.notice_version;

UPDATE procurement_processes p
SET current_stage=CASE
      WHEN n.notice_type LIKE 'pin-%' THEN 'planning'
      WHEN n.notice_type LIKE 'cn-%' THEN 'tender'
      WHEN n.notice_type='can-modif' THEN 'contract'
      WHEN n.notice_type LIKE 'can-%' OR n.notice_type='veat' THEN 'award'
      ELSE p.current_stage
    END
FROM (
  SELECT DISTINCT ON (process_id) process_id,notice_type
  FROM procurement_notices
  WHERE source_market='EU_TED'
  ORDER BY process_id,publication_date DESC NULLS LAST,notice_version DESC
) n
WHERE p.id=n.process_id;
