-- One-time, idempotent lifecycle derivation for U.S. rows loaded before the
-- global event model existed. Future ingestion derives the same fingerprints.

INSERT INTO buyers (source_country,source_system,source_buyer_id,name,source_url)
SELECT 'US','usaspending',a.awarding_agency,a.awarding_agency,
       max(COALESCE(a.source_url,'https://www.usaspending.gov/'))
FROM awards a
WHERE a.awarding_agency IS NOT NULL
GROUP BY a.awarding_agency
ON CONFLICT (source_system,source_buyer_id) DO UPDATE SET name=EXCLUDED.name;

INSERT INTO procurement_processes (
    source_country,source_system,source_process_id,buyer_id,primary_supplier_company_id,title,description,
    current_stage,status,award_date,contract_start_date,contract_end_date,value_native,currency,
    performance_locations,native_category_scheme,native_category_code,common_industry_id,source_url,source_last_modified,is_demo
)
SELECT 'US','usaspending',a.generated_award_id,b.id,a.recipient_company_id,a.title,a.description,
       'award','active',a.award_date,a.start_date,a.end_date,COALESCE(a.current_value,a.total_obligated),'USD',
       jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
         'country',a.performance_country,'state',a.performance_state,'county',a.performance_county,
         'county_fips',a.performance_county_fips,'city',a.performance_city,'postalCode',a.performance_zip
       ))),
       CASE WHEN a.naics IS NOT NULL THEN 'NAICS' WHEN a.psc IS NOT NULL THEN 'PSC' END,
       COALESCE(a.naics,a.psc),a.primary_industry_id,
       COALESCE(a.source_url,'https://www.usaspending.gov/'),a.last_modified,a.is_demo
FROM awards a
LEFT JOIN buyers b ON b.source_system='usaspending' AND b.source_buyer_id=a.awarding_agency
WHERE a.generated_award_id IS NOT NULL AND btrim(a.generated_award_id)<>''
ON CONFLICT (source_system,source_process_id) DO UPDATE SET
  buyer_id=COALESCE(EXCLUDED.buyer_id,procurement_processes.buyer_id),
  primary_supplier_company_id=EXCLUDED.primary_supplier_company_id,
  title=COALESCE(EXCLUDED.title,procurement_processes.title),
  description=COALESCE(EXCLUDED.description,procurement_processes.description),
  award_date=COALESCE(EXCLUDED.award_date,procurement_processes.award_date),
  contract_start_date=COALESCE(EXCLUDED.contract_start_date,procurement_processes.contract_start_date),
  contract_end_date=COALESCE(EXCLUDED.contract_end_date,procurement_processes.contract_end_date),
  value_native=COALESCE(EXCLUDED.value_native,procurement_processes.value_native),
  source_last_modified=GREATEST(EXCLUDED.source_last_modified,procurement_processes.source_last_modified);

UPDATE awards a SET procurement_process_id=p.id
FROM procurement_processes p
WHERE p.source_system='usaspending' AND p.source_process_id=a.generated_award_id
  AND a.procurement_process_id IS DISTINCT FROM p.id;

INSERT INTO procurement_process_suppliers (process_id,company_id,is_primary)
SELECT procurement_process_id,recipient_company_id,true FROM awards WHERE procurement_process_id IS NOT NULL
ON CONFLICT (process_id,company_id) DO UPDATE SET is_primary=true;

WITH ranked AS (
  SELECT t.*,row_number() OVER (PARTITION BY t.award_id ORDER BY t.action_date NULLS LAST,t.created_at,t.id) AS sequence
  FROM transactions t
)
INSERT INTO procurement_events (
  event_fingerprint,source_system,source_country,raw_source_id,process_id,award_id,company_id,buyer_id,
  event_type,event_at,title,description,value_native,currency,source_url,evidence
)
SELECT encode(digest('usaspending|' || r.source_transaction_id || '|' ||
         CASE WHEN r.sequence=1 THEN 'award_announced' ELSE 'contract_modified' END,'sha256'),'hex'),
       'usaspending','US',r.source_transaction_id,a.procurement_process_id,a.id,a.recipient_company_id,p.buyer_id,
       CASE WHEN r.sequence=1 THEN 'award_announced' ELSE 'contract_modified' END,
       COALESCE(r.action_date::timestamp AT TIME ZONE 'UTC',r.source_last_modified,r.created_at),
       COALESCE(a.title,a.piid,a.generated_award_id),COALESCE(r.description,a.description),
       COALESCE(r.current_total_value,a.current_value),'USD',COALESCE(a.source_url,'https://www.usaspending.gov/'),
       jsonb_strip_nulls(jsonb_build_object('transaction_id',r.source_transaction_id,'action_type',r.action_type,'modification_number',r.modification_number))
FROM ranked r JOIN awards a ON a.id=r.award_id
LEFT JOIN procurement_processes p ON p.id=a.procurement_process_id
ON CONFLICT (event_fingerprint) DO NOTHING;

WITH ranked AS (
  SELECT t.*,row_number() OVER (PARTITION BY t.award_id ORDER BY t.action_date NULLS LAST,t.created_at,t.id) AS sequence
  FROM transactions t
), value_events AS (
  SELECT r.*,
         CASE WHEN r.obligation < 0 THEN 'value_decreased' ELSE 'value_increased' END AS derived_type
  FROM ranked r WHERE r.obligation < 0 OR (r.obligation > 0 AND r.sequence > 1)
)
INSERT INTO procurement_events (
  event_fingerprint,source_system,source_country,raw_source_id,process_id,award_id,company_id,buyer_id,
  event_type,event_at,title,description,value_delta_native,value_native,currency,source_url,evidence
)
SELECT encode(digest('usaspending|' || r.source_transaction_id || '|' || r.derived_type,'sha256'),'hex'),
       'usaspending','US',r.source_transaction_id,a.procurement_process_id,a.id,a.recipient_company_id,p.buyer_id,
       r.derived_type,COALESCE(r.action_date::timestamp AT TIME ZONE 'UTC',r.source_last_modified,r.created_at),
       COALESCE(a.title,a.piid,a.generated_award_id),COALESCE(r.description,a.description),r.obligation,
       COALESCE(r.current_total_value,a.current_value),'USD',COALESCE(a.source_url,'https://www.usaspending.gov/'),
       jsonb_strip_nulls(jsonb_build_object('transaction_id',r.source_transaction_id,'action_type',r.action_type,'modification_number',r.modification_number))
FROM value_events r JOIN awards a ON a.id=r.award_id
LEFT JOIN procurement_processes p ON p.id=a.procurement_process_id
ON CONFLICT (event_fingerprint) DO NOTHING;

INSERT INTO procurement_events (
  event_fingerprint,source_system,source_country,raw_source_id,process_id,award_id,company_id,buyer_id,
  event_type,event_at,title,description,currency,source_url,evidence
)
SELECT encode(digest('usaspending|' || t.source_transaction_id || '|option_exercised','sha256'),'hex'),
       'usaspending','US',t.source_transaction_id,a.procurement_process_id,a.id,a.recipient_company_id,p.buyer_id,
       'option_exercised',COALESCE(t.action_date::timestamp AT TIME ZONE 'UTC',t.source_last_modified,t.created_at),
       COALESCE(a.title,a.piid,a.generated_award_id),COALESCE(t.description,a.description),'USD',
       COALESCE(a.source_url,'https://www.usaspending.gov/'),
       jsonb_strip_nulls(jsonb_build_object('transaction_id',t.source_transaction_id,'action_type',t.action_type,'modification_number',t.modification_number))
FROM transactions t JOIN awards a ON a.id=t.award_id
LEFT JOIN procurement_processes p ON p.id=a.procurement_process_id
WHERE concat_ws(' ',t.action_type,t.modification_number,t.description) ILIKE '%option%'
ON CONFLICT (event_fingerprint) DO NOTHING;

INSERT INTO procurement_events (
  event_fingerprint,source_system,source_country,raw_source_id,process_id,award_id,company_id,buyer_id,
  event_type,event_at,title,description,currency,source_url,evidence
)
SELECT encode(digest('usaspending|' || a.generated_award_id || '|contract_started','sha256'),'hex'),
       'usaspending','US',a.generated_award_id,a.procurement_process_id,a.id,a.recipient_company_id,p.buyer_id,
       'contract_started',a.start_date::timestamp AT TIME ZONE 'UTC',COALESCE(a.title,a.piid,a.generated_award_id),
       a.description,'USD',COALESCE(a.source_url,'https://www.usaspending.gov/'),
       jsonb_build_object('generated_award_id',a.generated_award_id)
FROM awards a LEFT JOIN procurement_processes p ON p.id=a.procurement_process_id
WHERE a.start_date IS NOT NULL AND a.generated_award_id IS NOT NULL
ON CONFLICT (event_fingerprint) DO NOTHING;
