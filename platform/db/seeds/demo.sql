-- Clearly marked fictional demonstration data. It is not presented as federal source data.
INSERT INTO industries (id, name, slug, description) VALUES
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
ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description;

INSERT INTO agencies (id,name,slug,code,parent_department) VALUES
('20000000-0000-0000-0000-000000000001','Department of Defense','department-of-defense','097','Department of Defense'),
('20000000-0000-0000-0000-000000000002','National Aeronautics and Space Administration','national-aeronautics-and-space-administration','080','National Aeronautics and Space Administration'),
('20000000-0000-0000-0000-000000000003','General Services Administration','general-services-administration','047','General Services Administration')
ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code;

INSERT INTO naics_industry_map (naics,industry_id,confidence) VALUES
('541512','10000000-0000-0000-0000-000000000003',0.98),
('541519','10000000-0000-0000-0000-000000000003',0.96),
('541715','10000000-0000-0000-0000-000000000014',0.92),
('336414','10000000-0000-0000-0000-000000000002',0.98),
('236220','10000000-0000-0000-0000-000000000009',0.98),
('541611','10000000-0000-0000-0000-000000000011',0.95)
ON CONFLICT (naics) DO UPDATE SET industry_id=EXCLUDED.industry_id, confidence=EXCLUDED.confidence;

INSERT INTO psc_industry_map (psc,industry_id,confidence) VALUES
('D302','10000000-0000-0000-0000-000000000003',0.95),
('D310','10000000-0000-0000-0000-000000000004',0.95),
('AR11','10000000-0000-0000-0000-000000000002',0.90),
('Y1JZ','10000000-0000-0000-0000-000000000009',0.92),
('R408','10000000-0000-0000-0000-000000000011',0.90)
ON CONFLICT (psc) DO UPDATE SET industry_id=EXCLUDED.industry_id, confidence=EXCLUDED.confidence;

INSERT INTO companies (
 id,uei,cage_code,legal_name,canonical_name,slug,recipient_address,recipient_city,recipient_county,
 recipient_county_fips,recipient_state,recipient_state_fips,recipient_zip,recipient_country,
 primary_industry_id,business_size,small_business,first_seen,last_seen,is_demo
) VALUES
('30000000-0000-0000-0000-000000000001','DEMOLOCAL001','D001A','Demo Potomac Analytics LLC','Potomac Analytics','potomac-analytics','1 Demo Plaza','Rockville','Montgomery County','24031','MD','24','20850','USA','10000000-0000-0000-0000-000000000005','Small',true,'2022-01-01','2026-10-10',true),
('30000000-0000-0000-0000-000000000002','DEMOOUTSIDE01','D002B','Demo Blue Ridge Systems Inc.','Blue Ridge Systems','blue-ridge-systems','2 Demo Drive','Reston','Fairfax County','51059','VA','51','20190','USA','10000000-0000-0000-0000-000000000004','Other than small',false,'2021-06-01','2026-10-09',true),
('30000000-0000-0000-0000-000000000003','DEMOSPACE0001','D003C','Demo Orbital Forge Corporation','Orbital Forge','orbital-forge','3 Demo Way','Greenbelt','Prince George''s County','24033','MD','24','20770','USA','10000000-0000-0000-0000-000000000002','Small',true,'2020-03-01','2026-10-08',true),
('30000000-0000-0000-0000-000000000004','DEMOLOGIS0001','D004D','Demo Lone Star Logistics LP','Lone Star Logistics','lone-star-logistics','4 Demo Road','San Antonio','Bexar County','48029','TX','48','78205','USA','10000000-0000-0000-0000-000000000017','Other than small',false,'2023-02-01','2026-10-07',true)
ON CONFLICT (slug) DO UPDATE SET last_seen=EXCLUDED.last_seen, is_demo=true;

INSERT INTO awards (
 id,generated_award_id,piid,recipient_company_id,award_type,title,description,awarding_department,awarding_agency,
 awarding_subagency,agency_id,naics,psc,primary_industry_id,classification_confidence,classification_evidence,
 total_obligated,current_value,potential_value,award_date,start_date,end_date,last_modified,
 performance_country,performance_state,performance_state_fips,performance_county,performance_county_fips,
 performance_city,performance_zip,source_url,is_demo
) VALUES
('40000000-0000-0000-0000-000000000001','DEMO_AWARD_LOCAL_LOCAL','DEMO-PA-001','30000000-0000-0000-0000-000000000001','Contract','DEMO — Data fusion platform','Fictional seed record for a secure data fusion platform.','Department of Defense','Department of Defense','Defense Information Systems Agency','20000000-0000-0000-0000-000000000001','541512','D302','10000000-0000-0000-0000-000000000005',0.88,'[{"type":"keyword","value":"data fusion"}]',4200000,6500000,9000000,'2026-10-10','2026-10-15','2027-10-14','2026-10-10T16:00:00Z','USA','MD','24','Montgomery County','24031','Rockville','20850','https://www.usaspending.gov/',true),
('40000000-0000-0000-0000-000000000002','DEMO_AWARD_LOCAL_OUTSIDE','DEMO-PA-002','30000000-0000-0000-0000-000000000001','Task Order','DEMO — Cloud modernization','Fictional seed record for cloud modernization performed in Virginia.','General Services Administration','General Services Administration','Federal Acquisition Service','20000000-0000-0000-0000-000000000003','541519','D302','10000000-0000-0000-0000-000000000003',0.98,'[{"type":"naics","value":"541519"}]',1200000,2000000,3200000,'2026-09-18','2026-09-20','2027-09-19','2026-10-05T11:00:00Z','USA','VA','51','Fairfax County','51059','Reston','20190','https://www.usaspending.gov/',true),
('40000000-0000-0000-0000-000000000003','DEMO_AWARD_OUTSIDE_LOCAL','DEMO-BR-001','30000000-0000-0000-0000-000000000002','Contract','DEMO — Cyber operations support','Fictional seed record for cyber operations support in Bethesda.','Department of Defense','Department of Defense','Department of the Navy','20000000-0000-0000-0000-000000000001','541512','D310','10000000-0000-0000-0000-000000000004',0.97,'[{"type":"psc","value":"D310"}]',8700000,11000000,16500000,'2026-10-09','2026-10-12','2028-10-11','2026-10-09T14:00:00Z','USA','MD','24','Montgomery County','24031','Bethesda','20814','https://www.usaspending.gov/',true),
('40000000-0000-0000-0000-000000000004','DEMO_AWARD_SPACE','DEMO-OF-001','30000000-0000-0000-0000-000000000003','Contract','DEMO — Small satellite payload','Fictional seed record for satellite payload research.','National Aeronautics and Space Administration','National Aeronautics and Space Administration','Goddard Space Flight Center','20000000-0000-0000-0000-000000000002','336414','AR11','10000000-0000-0000-0000-000000000002',0.99,'[{"type":"naics","value":"336414"}]',15400000,21000000,28000000,'2026-10-08','2026-11-01','2029-10-31','2026-10-08T18:00:00Z','USA','MD','24','Prince George''s County','24033','Greenbelt','20771','https://www.usaspending.gov/',true),
('40000000-0000-0000-0000-000000000005','DEMO_AWARD_LOGISTICS','DEMO-LS-001','30000000-0000-0000-0000-000000000004','Delivery Order','DEMO — Regional freight support','Fictional seed record for regional freight support.','Department of Defense','Department of Defense','Defense Logistics Agency','20000000-0000-0000-0000-000000000001','484121','V119','10000000-0000-0000-0000-000000000017',0.83,'[{"type":"keyword","value":"freight"}]',980000,1400000,1400000,'2026-10-07','2026-10-07','2027-04-06','2026-10-07T12:00:00Z','USA','TX','48','Bexar County','48029','San Antonio','78205','https://www.usaspending.gov/',true),
('40000000-0000-0000-0000-000000000006','DEMO_AWARD_CONSTRUCTION','DEMO-BR-002','30000000-0000-0000-0000-000000000002','Contract','DEMO — Laboratory renovation','Fictional seed record for laboratory renovation in Rockville.','General Services Administration','General Services Administration','Public Buildings Service','20000000-0000-0000-0000-000000000003','236220','Y1JZ','10000000-0000-0000-0000-000000000009',0.98,'[{"type":"naics","value":"236220"}]',2500000,4400000,5000000,'2026-08-20','2026-09-01','2027-08-31','2026-10-02T09:00:00Z','USA','MD','24','Montgomery County','24031','Rockville','20852','https://www.usaspending.gov/',true)
ON CONFLICT (generated_award_id) WHERE generated_award_id IS NOT NULL AND btrim(generated_award_id) <> ''
DO UPDATE SET last_modified=EXCLUDED.last_modified, is_demo=true;

INSERT INTO transactions (
 id,source_transaction_id,award_id,action_date,action_type,modification_number,obligation,
 current_total_value,potential_total_value,description,source_last_modified,is_demo
) VALUES
('50000000-0000-0000-0000-000000000001','DEMO_TX_001','40000000-0000-0000-0000-000000000001','2026-10-10','New award','0',4200000,6500000,9000000,'DEMO initial obligation','2026-10-10T16:00:00Z',true),
('50000000-0000-0000-0000-000000000002','DEMO_TX_002','40000000-0000-0000-0000-000000000001','2026-10-11','Modification','P00001',350000,6850000,9000000,'DEMO option exercise','2026-10-11T16:00:00Z',true),
('50000000-0000-0000-0000-000000000003','DEMO_TX_003','40000000-0000-0000-0000-000000000002','2026-09-18','New award','0',1200000,2000000,3200000,'DEMO initial obligation','2026-10-05T11:00:00Z',true),
('50000000-0000-0000-0000-000000000004','DEMO_TX_004','40000000-0000-0000-0000-000000000003','2026-10-09','New award','0',8700000,11000000,16500000,'DEMO cyber support award','2026-10-09T14:00:00Z',true),
('50000000-0000-0000-0000-000000000005','DEMO_TX_005','40000000-0000-0000-0000-000000000004','2026-10-08','New award','0',15400000,21000000,28000000,'DEMO satellite payload award','2026-10-08T18:00:00Z',true),
('50000000-0000-0000-0000-000000000006','DEMO_TX_006','40000000-0000-0000-0000-000000000005','2026-10-07','New award','0',980000,1400000,1400000,'DEMO freight award','2026-10-07T12:00:00Z',true),
('50000000-0000-0000-0000-000000000007','DEMO_TX_007','40000000-0000-0000-0000-000000000006','2026-08-20','New award','0',2100000,4000000,5000000,'DEMO construction award','2026-08-20T12:00:00Z',true),
('50000000-0000-0000-0000-000000000008','DEMO_TX_008','40000000-0000-0000-0000-000000000006','2026-10-02','Modification','P00001',400000,4400000,5000000,'DEMO renovation modification','2026-10-02T09:00:00Z',true)
ON CONFLICT (source_transaction_id) DO UPDATE SET obligation=EXCLUDED.obligation, source_last_modified=EXCLUDED.source_last_modified, is_demo=true;
