DO $$
DECLARE
  -- Variables to hold Unit organisation IDs
  org_odompatta       uuid;
  org_chem_east       uuid;
  org_vetti           uuid;
  org_koda_south      uuid;
  org_koda_north      uuid;

  -- Variables to hold Unit Tenant IDs
  t_odompatta       uuid;
  t_chem_east       uuid;
  t_vetti           uuid;
  t_koda_south      uuid;
  t_koda_north      uuid;
BEGIN
  -- 1. DELETE EXISTING TEST DATA
  -- Deleting all participants to keep it clean (since this is a test env)
  DELETE FROM mark_entries;
  DELETE FROM results;
  DELETE FROM registrations;
  DELETE FROM participants;

  -- 2. FETCH ORG IDs and TENANT IDs dynamically
  SELECT id, tenant_id INTO org_odompatta, t_odompatta FROM organisations WHERE name = 'Odompatta' LIMIT 1;
  SELECT id, tenant_id INTO org_chem_east, t_chem_east FROM organisations WHERE name = 'Chembrasseri East' LIMIT 1;
  SELECT id, tenant_id INTO org_vetti, t_vetti FROM organisations WHERE name = 'Vettikaattiri' LIMIT 1;
  SELECT id, tenant_id INTO org_koda_south, t_koda_south FROM organisations WHERE name = 'Kodasseri South' LIMIT 1;
  SELECT id, tenant_id INTO org_koda_north, t_koda_north FROM organisations WHERE name = 'Kodasseri North' LIMIT 1;

  -- 3. INSERT 8 MALE PARTICIPANTS (4 LP, 4 HS) PER UNIT
  -- Notice that tenant_id is set to the UNIT'S tenant_id (e.g., t_odompatta), NOT the Sector's tenant_id!
  
  -- ── ODOMPATTA ──
  IF org_odompatta IS NOT NULL THEN
    INSERT INTO participants (id, tenant_id, name, chest_number, category_code, organisation_id, status, gender, created_at) VALUES
    (gen_random_uuid(), t_odompatta, 'Ameen Riyas',      'LP-101', 'LP', org_odompatta, 'approved', 'M', now()),
    (gen_random_uuid(), t_odompatta, 'Haris Muhammed',   'LP-102', 'LP', org_odompatta, 'approved', 'M', now()),
    (gen_random_uuid(), t_odompatta, 'Shafin Basheer',   'LP-103', 'LP', org_odompatta, 'approved', 'M', now()),
    (gen_random_uuid(), t_odompatta, 'Bilal Siddiq',     'LP-104', 'LP', org_odompatta, 'approved', 'M', now()),
    (gen_random_uuid(), t_odompatta, 'Adnan Farooq',     'HS-101', 'HS', org_odompatta, 'approved', 'M', now()),
    (gen_random_uuid(), t_odompatta, 'Faizan Kabeer',    'HS-102', 'HS', org_odompatta, 'approved', 'M', now()),
    (gen_random_uuid(), t_odompatta, 'Ziyad Rashid',     'HS-103', 'HS', org_odompatta, 'approved', 'M', now()),
    (gen_random_uuid(), t_odompatta, 'Thasnim Ali',      'HS-104', 'HS', org_odompatta, 'approved', 'M', now());
  END IF;

  -- ── CHEMBRASSERI EAST ──
  IF org_chem_east IS NOT NULL THEN
    INSERT INTO participants (id, tenant_id, name, chest_number, category_code, organisation_id, status, gender, created_at) VALUES
    (gen_random_uuid(), t_chem_east, 'Adil Rahman',      'LP-201', 'LP', org_chem_east, 'approved', 'M', now()),
    (gen_random_uuid(), t_chem_east, 'Roshan Kabeer',    'LP-202', 'LP', org_chem_east, 'approved', 'M', now()),
    (gen_random_uuid(), t_chem_east, 'Irfan Shereef',    'LP-203', 'LP', org_chem_east, 'approved', 'M', now()),
    (gen_random_uuid(), t_chem_east, 'Shaheen Bashir',   'LP-204', 'LP', org_chem_east, 'approved', 'M', now()),
    (gen_random_uuid(), t_chem_east, 'Navas Hameed',     'HS-201', 'HS', org_chem_east, 'approved', 'M', now()),
    (gen_random_uuid(), t_chem_east, 'Sinan Rashid',     'HS-202', 'HS', org_chem_east, 'approved', 'M', now()),
    (gen_random_uuid(), t_chem_east, 'Yasin Farooq',     'HS-203', 'HS', org_chem_east, 'approved', 'M', now()),
    (gen_random_uuid(), t_chem_east, 'Hamdan Ashraf',    'HS-204', 'HS', org_chem_east, 'approved', 'M', now());
  END IF;

  -- ── VETTIKAATTIRI ──
  IF org_vetti IS NOT NULL THEN
    INSERT INTO participants (id, tenant_id, name, chest_number, category_code, organisation_id, status, gender, created_at) VALUES
    (gen_random_uuid(), t_vetti, 'Jishad P',         'LP-401', 'LP', org_vetti, 'approved', 'M', now()),
    (gen_random_uuid(), t_vetti, 'Basim Jawad',      'LP-402', 'LP', org_vetti, 'approved', 'M', now()),
    (gen_random_uuid(), t_vetti, 'Sulaiman Basheer', 'LP-403', 'LP', org_vetti, 'approved', 'M', now()),
    (gen_random_uuid(), t_vetti, 'Nawaf Shereef',    'LP-404', 'LP', org_vetti, 'approved', 'M', now()),
    (gen_random_uuid(), t_vetti, 'Riyas Muhammed',   'HS-401', 'HS', org_vetti, 'approved', 'M', now()),
    (gen_random_uuid(), t_vetti, 'Rafeek Ibrahim',   'HS-402', 'HS', org_vetti, 'approved', 'M', now()),
    (gen_random_uuid(), t_vetti, 'Noufal Kareem',    'HS-403', 'HS', org_vetti, 'approved', 'M', now()),
    (gen_random_uuid(), t_vetti, 'Shabeer Ahamed',   'HS-404', 'HS', org_vetti, 'approved', 'M', now());
  END IF;

  -- ── KODASSERI SOUTH ──
  IF org_koda_south IS NOT NULL THEN
    INSERT INTO participants (id, tenant_id, name, chest_number, category_code, organisation_id, status, gender, created_at) VALUES
    (gen_random_uuid(), t_koda_south, 'Safwan Jaleel',    'LP-501', 'LP', org_koda_south, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_south, 'Muhammed Rafi',    'LP-502', 'LP', org_koda_south, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_south, 'Irsad Babu',       'LP-503', 'LP', org_koda_south, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_south, 'Anees Farhan',     'LP-504', 'LP', org_koda_south, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_south, 'Shibili Rahiman',  'HS-501', 'HS', org_koda_south, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_south, 'Mukhtar Salim',    'HS-502', 'HS', org_koda_south, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_south, 'Firoze Ahamed',    'HS-503', 'HS', org_koda_south, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_south, 'Arafath Kabeer',   'HS-504', 'HS', org_koda_south, 'approved', 'M', now());
  END IF;

  -- ── KODASSERI NORTH ──
  IF org_koda_north IS NOT NULL THEN
    INSERT INTO participants (id, tenant_id, name, chest_number, category_code, organisation_id, status, gender, created_at) VALUES
    (gen_random_uuid(), t_koda_north, 'Muhammed Anas',    'LP-601', 'LP', org_koda_north, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_north, 'Salman Rasheed',   'LP-602', 'LP', org_koda_north, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_north, 'Ammar Siddiq',     'LP-603', 'LP', org_koda_north, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_north, 'Tawfeeq Noor',     'LP-604', 'LP', org_koda_north, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_north, 'Ikhlas Basheer',   'HS-601', 'HS', org_koda_north, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_north, 'Zubair Rashid',    'HS-602', 'HS', org_koda_north, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_north, 'Muhammed Rayyan',  'HS-603', 'HS', org_koda_north, 'approved', 'M', now()),
    (gen_random_uuid(), t_koda_north, 'Yaseen Farooq',    'HS-604', 'HS', org_koda_north, 'approved', 'M', now());
  END IF;

  RAISE NOTICE 'SUCCESS: Old data wiped. New male participants added with CORRECT child tenant_id!';
END $$;
