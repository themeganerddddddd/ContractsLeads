-- Production reference taxonomy. This intentionally contains no companies,
-- awards, transactions, or other demonstration records.

INSERT INTO industries (id,name,slug,description) VALUES
('10000000-0000-0000-0000-000000000001','Aerospace & Defense','aerospace-defense','Defense platforms, mission systems, and related services.'),
('10000000-0000-0000-0000-000000000002','Space & Satellite','space-satellite','Space systems, launch, payloads, and satellite services.'),
('10000000-0000-0000-0000-000000000003','Information Technology','information-technology','Software, cloud, infrastructure, and IT services.'),
('10000000-0000-0000-0000-000000000004','Cybersecurity','cybersecurity','Cyber defense, information assurance, and security operations.'),
('10000000-0000-0000-0000-000000000005','Artificial Intelligence & Data','artificial-intelligence-data','AI, machine learning, analytics, and data platforms.'),
('10000000-0000-0000-0000-000000000006','Telecommunications','telecommunications','Network and communications products and services.'),
('10000000-0000-0000-0000-000000000007','Semiconductors & Electronics','semiconductors-electronics','Semiconductors, sensors, and electronic components.'),
('10000000-0000-0000-0000-000000000008','Advanced Manufacturing','advanced-manufacturing','Advanced production systems and industrial technology.'),
('10000000-0000-0000-0000-000000000009','Construction','construction','Construction and civil works.'),
('10000000-0000-0000-0000-000000000010','Architecture & Engineering','architecture-engineering','Architecture, engineering, and technical design.'),
('10000000-0000-0000-0000-000000000011','Professional Services','professional-services','Management, advisory, and professional support.'),
('10000000-0000-0000-0000-000000000012','Healthcare','healthcare','Clinical, health systems, and healthcare services.'),
('10000000-0000-0000-0000-000000000013','Biotechnology & Pharmaceuticals','biotechnology-pharmaceuticals','Biotechnology, therapeutics, and pharmaceuticals.'),
('10000000-0000-0000-0000-000000000014','Research & Science','research-science','Scientific research and laboratory services.'),
('10000000-0000-0000-0000-000000000015','Energy','energy','Energy systems, fuels, and grid services.'),
('10000000-0000-0000-0000-000000000016','Environmental Services','environmental-services','Environmental remediation and related services.'),
('10000000-0000-0000-0000-000000000017','Transportation & Logistics','transportation-logistics','Transportation, distribution, and logistics.'),
('10000000-0000-0000-0000-000000000018','Facilities & Real Estate','facilities-real-estate','Facilities operations and real estate services.'),
('10000000-0000-0000-0000-000000000019','Food & Agriculture','food-agriculture','Food supply and agricultural services.'),
('10000000-0000-0000-0000-000000000020','Education & Training','education-training','Education, workforce development, and training.'),
('10000000-0000-0000-0000-000000000021','Other','other','Activity not yet mapped to a more specific industry.')
ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;

INSERT INTO naics_industry_map (naics,industry_id,confidence) VALUES
('336414','10000000-0000-0000-0000-000000000002',0.98),
('336415','10000000-0000-0000-0000-000000000002',0.98),
('336419','10000000-0000-0000-0000-000000000002',0.98),
('541511','10000000-0000-0000-0000-000000000003',0.98),
('541512','10000000-0000-0000-0000-000000000003',0.98),
('541513','10000000-0000-0000-0000-000000000003',0.98),
('541519','10000000-0000-0000-0000-000000000003',0.98),
('541715','10000000-0000-0000-0000-000000000014',0.98),
('541611','10000000-0000-0000-0000-000000000011',0.98),
('236220','10000000-0000-0000-0000-000000000009',0.98),
('517311','10000000-0000-0000-0000-000000000006',0.98),
('334413','10000000-0000-0000-0000-000000000007',0.98),
('621111','10000000-0000-0000-0000-000000000012',0.98),
('325412','10000000-0000-0000-0000-000000000013',0.98)
ON CONFLICT (naics) DO UPDATE SET industry_id=EXCLUDED.industry_id,confidence=EXCLUDED.confidence;

INSERT INTO psc_industry_map (psc,industry_id,confidence) VALUES
('D302','10000000-0000-0000-0000-000000000003',0.95),
('D310','10000000-0000-0000-0000-000000000004',0.95),
('AR11','10000000-0000-0000-0000-000000000002',0.95),
('Y1JZ','10000000-0000-0000-0000-000000000009',0.95),
('R408','10000000-0000-0000-0000-000000000011',0.95),
('R425','10000000-0000-0000-0000-000000000011',0.95),
('Q201','10000000-0000-0000-0000-000000000012',0.95),
('V119','10000000-0000-0000-0000-000000000017',0.95)
ON CONFLICT (psc) DO UPDATE SET industry_id=EXCLUDED.industry_id,confidence=EXCLUDED.confidence;

INSERT INTO cpv_industry_map (cpv_prefix,industry_id,confidence,notes,reviewed_at)
SELECT mapping.cpv_prefix,i.id,mapping.confidence,mapping.notes,current_timestamp
FROM (VALUES
 ('09','energy',0.90,'Energy products and fuels'),
 ('30','information-technology',0.85,'Office and computing equipment'),
 ('32','telecommunications',0.85,'Radio, television and telecommunications equipment'),
 ('33','healthcare',0.85,'Medical equipment and personal care products'),
 ('35','aerospace-defense',0.82,'Security, fire-fighting and defence equipment'),
 ('45','construction',0.95,'Construction work'),
 ('60','transportation-logistics',0.90,'Transport services'),
 ('71','architecture-engineering',0.92,'Architectural, construction and engineering services'),
 ('72','information-technology',0.95,'IT services'),
 ('73','research-science',0.90,'Research and development services'),
 ('79','professional-services',0.85,'Business services'),
 ('80','education-training',0.92,'Education and training services'),
 ('85','healthcare',0.92,'Health and social work services'),
 ('90','environmental-services',0.90,'Environmental services')
) AS mapping(cpv_prefix,industry_slug,confidence,notes)
JOIN industries i ON i.slug=mapping.industry_slug
ON CONFLICT (cpv_prefix) DO UPDATE SET industry_id=EXCLUDED.industry_id,
  confidence=EXCLUDED.confidence,notes=EXCLUDED.notes,reviewed_at=EXCLUDED.reviewed_at;

WITH exact_award_mappings AS (
  SELECT a.id,COALESCE(n.industry_id,p.industry_id) AS industry_id,
    COALESCE(n.confidence,p.confidence) AS confidence
  FROM awards a
  LEFT JOIN naics_industry_map n ON n.naics=a.naics
  LEFT JOIN psc_industry_map p ON p.psc=a.psc
  WHERE a.primary_industry_id IS NULL AND COALESCE(n.industry_id,p.industry_id) IS NOT NULL
)
UPDATE awards a SET primary_industry_id=m.industry_id,
  classification_confidence=GREATEST(COALESCE(a.classification_confidence,0),m.confidence)
FROM exact_award_mappings m WHERE a.id=m.id;

INSERT INTO award_industries (award_id,industry_id,confidence,evidence,is_primary)
SELECT a.id,a.primary_industry_id,a.classification_confidence,a.classification_evidence,true
FROM awards a WHERE a.primary_industry_id IS NOT NULL
ON CONFLICT (award_id,industry_id) DO UPDATE SET confidence=EXCLUDED.confidence,
  evidence=EXCLUDED.evidence,is_primary=true;

WITH exact_process_mappings AS (
  SELECT DISTINCT ON (p.id) p.id,m.industry_id
  FROM procurement_processes p
  JOIN cpv_industry_map m ON p.native_category_code LIKE m.cpv_prefix || '%'
  WHERE p.common_industry_id IS NULL AND p.native_category_scheme='CPV'
  ORDER BY p.id,length(m.cpv_prefix) DESC
)
UPDATE procurement_processes p SET common_industry_id=m.industry_id
FROM exact_process_mappings m WHERE p.id=m.id;
