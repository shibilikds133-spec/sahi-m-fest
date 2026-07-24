-- ═══════════════════════════════════════════════════════════════════
--  INSERT: Muhammed Shibili N  |  Chest: 2002  |  Category: GENERAL
--  Events: MALAPPATTU, MOULID RECITATION, NASHEED (all group, captain)
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_participant_id  uuid;
  v_org_id          uuid;
  v_tenant_id       uuid;
  v_festival_id     uuid := '550e8400-e29b-41d4-a716-446655440000';

  v_item_malappattu     uuid;
  v_item_moulid         uuid;
  v_item_nasheed        uuid;

BEGIN

  -- ── STEP 1: Find organisation using the provided ID ──────────────
  SELECT id, tenant_id
  INTO   v_org_id, v_tenant_id
  FROM   organisations
  WHERE  id = 'd3ed1102-31a6-4e44-86ca-7a41c4359db1' 
      OR tenant_id = 'd3ed1102-31a6-4e44-86ca-7a41c4359db1'
  LIMIT  1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organisation found. Please create one first.';
  END IF;

  RAISE NOTICE 'Using organisation id=% tenant=%', v_org_id, v_tenant_id;

  -- ── STEP 2: Insert Participant ────────────────────────────────────────────
  -- Remove existing registrations and entry with same chest_number to avoid conflict
  DELETE FROM registrations WHERE participant_id IN (SELECT id FROM participants WHERE chest_number = '2002');
  DELETE FROM participants WHERE chest_number = '2002';

  INSERT INTO participants (
    id,
    tenant_id,
    festival_id,
    organisation_id,
    name,
    chest_number,
    category_code,
    gender,
    status,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_tenant_id,
    v_festival_id,
    v_org_id,
    'Muhammed Shibili N',
    '2002',
    'GENERAL',
    'boys',
    'approved',
    now()
  )
  RETURNING id INTO v_participant_id;

  RAISE NOTICE 'Participant inserted: id=%', v_participant_id;

  -- ── STEP 3: Find event/item IDs by name (case-insensitive) ───────────────
  SELECT id INTO v_item_malappattu
  FROM   items
  WHERE  LOWER(item_name_en) LIKE '%malappattu%'
  LIMIT  1;

  SELECT id INTO v_item_moulid
  FROM   items
  WHERE  LOWER(item_name_en) LIKE '%moulid%'
  LIMIT  1;

  SELECT id INTO v_item_nasheed
  FROM   items
  WHERE  LOWER(item_name_en) LIKE '%nasheed%'
  LIMIT  1;

  -- ── STEP 4: Register for MALAPPATTU ──────────────────────────────────────
  IF v_item_malappattu IS NOT NULL THEN
    -- Remove duplicate if exists
    DELETE FROM registrations
    WHERE participant_id = v_participant_id
      AND item_id = v_item_malappattu;

    INSERT INTO registrations (
      id,
      tenant_id,
      festival_id,
      participant_id,
      item_id,
      organisation_id,
      status,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_tenant_id,
      v_festival_id,
      v_participant_id,
      v_item_malappattu,
      v_org_id,
      'pending',
      now()
    );
    RAISE NOTICE 'Registered for MALAPPATTU (item_id=%)', v_item_malappattu;
  ELSE
    RAISE WARNING 'Event MALAPPATTU not found in items table. Skipped registration.';
  END IF;

  -- ── STEP 5: Register for MOULID RECITATION ───────────────────────────────
  IF v_item_moulid IS NOT NULL THEN
    DELETE FROM registrations
    WHERE participant_id = v_participant_id
      AND item_id = v_item_moulid;

    INSERT INTO registrations (
      id,
      tenant_id,
      festival_id,
      participant_id,
      item_id,
      organisation_id,
      status,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_tenant_id,
      v_festival_id,
      v_participant_id,
      v_item_moulid,
      v_org_id,
      'pending',
      now()
    );
    RAISE NOTICE 'Registered for MOULID RECITATION (item_id=%)', v_item_moulid;
  ELSE
    RAISE WARNING 'Event MOULID RECITATION not found in items table. Skipped registration.';
  END IF;

  -- ── STEP 6: Register for NASHEED ─────────────────────────────────────────
  IF v_item_nasheed IS NOT NULL THEN
    DELETE FROM registrations
    WHERE participant_id = v_participant_id
      AND item_id = v_item_nasheed;

    INSERT INTO registrations (
      id,
      tenant_id,
      festival_id,
      participant_id,
      item_id,
      organisation_id,
      status,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_tenant_id,
      v_festival_id,
      v_participant_id,
      v_item_nasheed,
      v_org_id,
      'pending',
      now()
    );
    RAISE NOTICE 'Registered for NASHEED (item_id=%)', v_item_nasheed;
  ELSE
    RAISE WARNING 'Event NASHEED not found in items table. Skipped registration.';
  END IF;

  RAISE NOTICE '✅ SUCCESS: Muhammed Shibili N (Chest: 2002) added. Participant ID: %', v_participant_id;

END $$;
