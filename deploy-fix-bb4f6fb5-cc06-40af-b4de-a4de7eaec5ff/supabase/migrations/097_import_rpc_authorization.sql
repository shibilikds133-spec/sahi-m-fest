-- 097_import_rpc_authorization.sql
-- C1: Harden all 8 dataset-import RPCs with server-side authorization.
--
-- Scope (approved product decisions):
--   * Require an authenticated caller.
--   * Deny authenticated non-admin users.
--   * Allow own-tenant and authorised descendant-tenant imports (hierarchy walk-down).
--   * Allow explicit superadmin cross-tenant imports.
--   * p_festival_id must be supplied (NOT NULL), exist, and belong to the target tenant.
--   * Verify items/venues belong to the permitted festival; scope duplicate detection
--     to the target tenant/festival; verify reused participant IDs belong to the
--     permitted tenant/festival.
--   * Remove raw SQL error leakage (SQLERRM) from row-level error feedback.
--   * Revoke execution from PUBLIC/anon; grant execution only to authenticated.
--   * Preserve existing RPC signatures (frontend compatibility) and schema-qualified refs.
--
-- Forward-only. Do NOT apply to Supabase until reviewed.

--------------------------------------------------------------------------------
-- 1. INTERNAL AUTHORIZATION HELPER (no client grant)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_import_access(
  p_target_tenant_id uuid,
  p_target_festival_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_is_admin boolean;
BEGIN
  -- Authenticated caller required
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Festival must be supplied (NULL rejected)
  IF p_target_festival_id IS NULL THEN
    RAISE EXCEPTION 'Festival is required';
  END IF;

  -- Admin gate: deny normal authenticated non-admin users
  SELECT COALESCE(p.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader', 'superadmin'), false)
          OR COALESCE(p.is_superadmin, false)
    INTO v_is_admin
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  -- Tenant access: caller's own tenant, an authorised descendant org's tenant,
  -- or (explicitly) superadmin cross-tenant.
  -- get_visible_organisations walks DOWN the caller's hierarchy only.
  IF NOT (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1
        FROM public.get_visible_organisations(public.get_my_tenant_id()) vo
       WHERE vo.tenant_id = p_target_tenant_id
          OR vo.id = (SELECT organisation_id FROM public.tenants WHERE id = p_target_tenant_id)
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied: target tenant is not within your hierarchy';
  END IF;

  -- Festival must belong to the target tenant (enforced for superadmin too)
  IF NOT EXISTS (
    SELECT 1
      FROM public.festival_calendar fc
     WHERE fc.id = p_target_festival_id
       AND fc.tenant_id = p_target_tenant_id
  ) THEN
    RAISE EXCEPTION 'Festival does not belong to the target tenant';
  END IF;
END;
$$;

-- Internal only: no PUBLIC/anon/authenticated execute grant
REVOKE ALL ON FUNCTION public._assert_import_access(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_import_access(uuid, uuid) FROM anon;

--------------------------------------------------------------------------------
-- 2. JUNIOR IMPORT RPC (058)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_junior_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id uuid,
  p_participants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_items jsonb;
  v_item_code text;
  v_participant_id uuid;
  v_existing_name text;
  v_item_id uuid;

  v_imported_parts int := 0;
  v_skipped_parts int := 0;
  v_imported_regs int := 0;
  v_skipped_regs int := 0;

  v_invalid_items jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- 4a. Scoped Advisory Lock
  -- Lock to prevent concurrent imports on the same festival
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text));

  -- Ensure session is valid AND scoped to the target tenant/festival
  IF p_session_id IS NOT NULL THEN
    UPDATE public.import_sessions
    SET status = 'processing'
    WHERE id = p_session_id AND status = 'pending'
      AND tenant_id = p_tenant_id AND festival_id = p_festival_id;
  END IF;

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := v_participant->>'chest_number';
    v_name := v_participant->>'name';
    v_items := v_participant->'items';

    -- Check if participant exists (scoped to the permitted tenant/festival)
    SELECT id, name INTO v_participant_id, v_existing_name
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      -- Existing participant
      IF v_existing_name <> v_name THEN
        -- CRITICAL: Name mismatch
        v_errors := v_errors || jsonb_build_object(
          'chest_number', v_chest,
          'error', 'Name mismatch for existing chest number',
          'existing_name', v_existing_name,
          'import_name', v_name
        );
        v_skipped_parts := v_skipped_parts + 1;
        CONTINUE; -- Skip entire participant
      ELSE
        v_skipped_parts := v_skipped_parts + 1; -- Idempotent skip
      END IF;
    ELSE
      -- Create new participant
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'JUNIOR', 'approved'
      ) RETURNING id INTO v_participant_id;

      v_imported_parts := v_imported_parts + 1;
    END IF;

    -- Process Items
    FOR v_item_code IN SELECT * FROM jsonb_array_elements_text(v_items)
    LOOP
      SELECT id INTO v_item_id
      FROM public.items
      WHERE festival_id = p_festival_id
        AND item_code = v_item_code
      LIMIT 1;

      IF v_item_id IS NOT NULL THEN
        -- Safely insert registration
        INSERT INTO public.registrations (
          tenant_id, festival_id, participant_id, item_id, status
        ) VALUES (
          p_tenant_id, p_festival_id, v_participant_id, v_item_id, 'approved'
        )
        ON CONFLICT (participant_id, item_id, festival_id) DO NOTHING;

        IF FOUND THEN
          v_imported_regs := v_imported_regs + 1;
        ELSE
          v_skipped_regs := v_skipped_regs + 1;
        END IF;
      ELSE
        v_invalid_items := v_invalid_items || jsonb_build_object(
          'chest_number', v_chest,
          'item_code', v_item_code,
          'error', 'Item not found or not in JUNIOR category'
        );
      END IF;
    END LOOP;

  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_parts,
    'skipped_participants', v_skipped_parts,
    'imported_registrations', v_imported_regs,
    'skipped_registrations', v_skipped_regs,
    'invalid_items', v_invalid_items,
    'errors', v_errors,
    'warnings', v_warnings
  );
END;
$$;

--------------------------------------------------------------------------------
-- 3. SENIOR IMPORT RPC (059)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_senior_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id uuid,
  p_participants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_items jsonb;
  v_item_code text;
  v_participant_id uuid;
  v_existing_name text;
  v_item_id uuid;
  v_festival_level text;

  v_imported_parts int := 0;
  v_skipped_parts int := 0;
  v_imported_regs int := 0;
  v_skipped_regs int := 0;

  v_invalid_items jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- 1. Scoped Advisory Lock
  -- Lock to prevent concurrent imports on the same festival
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text));

  -- 2. Detect Festival Level
  SELECT COALESCE(level, 'sector') INTO v_festival_level
  FROM public.festival_calendar
  WHERE id = p_festival_id
  LIMIT 1;

  -- Ensure session is valid AND scoped to the target tenant/festival
  IF p_session_id IS NOT NULL THEN
    UPDATE public.import_sessions
    SET status = 'processing'
    WHERE id = p_session_id AND status = 'pending'
      AND tenant_id = p_tenant_id AND festival_id = p_festival_id;
  END IF;

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := v_participant->>'chest_number';
    v_name := v_participant->>'name';
    v_items := v_participant->'items';

    -- Clean name format: spaces normalized, full caps (though frontend does it too)
    v_name := UPPER(TRIM(REGEXP_REPLACE(v_name, '\s+', ' ', 'g')));

    -- Check if participant exists with this chest number (scoped to permitted tenant/festival)
    SELECT id, name INTO v_participant_id, v_existing_name
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      -- Existing participant
      IF UPPER(TRIM(REGEXP_REPLACE(v_existing_name, '\s+', ' ', 'g'))) <> v_name THEN
        -- CRITICAL: Name mismatch for the same chest number
        v_errors := v_errors || jsonb_build_object(
          'chest_number', v_chest,
          'error', 'Name mismatch for existing chest number',
          'existing_name', v_existing_name,
          'import_name', v_name
        );
        v_skipped_parts := v_skipped_parts + 1;
        CONTINUE; -- Skip this participant completely to prevent corrupting existing records
      ELSE
        -- Idempotent skip: same participant, just make sure they exist
        v_skipped_parts := v_skipped_parts + 1;
      END IF;
    ELSE
      -- Create new participant with SENIOR category
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'SENIOR', 'approved'
      ) RETURNING id INTO v_participant_id;

      v_imported_parts := v_imported_parts + 1;
    END IF;

    -- Process Items safely
    FOR v_item_code IN SELECT * FROM jsonb_array_elements_text(v_items)
    LOOP
      -- Check if item is valid, belongs to the festival, and is in SR/SENIOR or GN category
      SELECT id INTO v_item_id
      FROM public.items
      WHERE festival_id = p_festival_id
        AND item_code = v_item_code
        AND (
          'SENIOR' = ANY(category_codes) OR
          'SR' = ANY(category_codes) OR
          'GN' = ANY(category_codes)
        )
      LIMIT 1;

      IF v_item_id IS NOT NULL THEN
        -- Safely insert registration with the dynamically detected festival level
        INSERT INTO public.registrations (
          tenant_id, festival_id, participant_id, item_id, status, level
        ) VALUES (
          p_tenant_id, p_festival_id, v_participant_id, v_item_id, 'approved', v_festival_level
        )
        ON CONFLICT (participant_id, item_id, festival_id) DO NOTHING;

        IF FOUND THEN
          v_imported_regs := v_imported_regs + 1;
        ELSE
          v_skipped_regs := v_skipped_regs + 1;
        END IF;
      ELSE
        -- Log invalid items but DO NOT skip the whole participant (Partial-Safe Import)
        v_invalid_items := v_invalid_items || jsonb_build_object(
          'chest_number', v_chest,
          'item_code', v_item_code,
          'error', 'Item not found or not in SENIOR/General category'
        );
      END IF;
    END LOOP;

  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_parts,
    'skipped_participants', v_skipped_parts,
    'imported_registrations', v_imported_regs,
    'skipped_registrations', v_skipped_regs,
    'invalid_items', v_invalid_items,
    'errors', v_errors,
    'warnings', v_warnings
  );
END;
$$;

--------------------------------------------------------------------------------
-- 4. UPPER PRIMARY IMPORT RPC (070)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_upper_primary_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id uuid,
  p_participants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_items jsonb;
  v_item_code text;
  v_participant_id uuid;
  v_existing_name text;
  v_existing_gender text;
  v_item_id uuid;
  v_festival_level text;
  v_detected_gender text;

  v_imported_parts int := 0;
  v_skipped_parts int := 0;
  v_imported_regs int := 0;
  v_skipped_regs int := 0;

  v_invalid_items jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- 1. Scoped Advisory Lock
  -- Lock to prevent concurrent imports on the same festival
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text));

  -- 2. Detect Festival Level
  SELECT COALESCE(level, 'sector') INTO v_festival_level
  FROM public.festival_calendar
  WHERE id = p_festival_id
  LIMIT 1;

  -- Ensure session is valid AND scoped to the target tenant/festival
  IF p_session_id IS NOT NULL THEN
    UPDATE public.import_sessions
    SET status = 'processing'
    WHERE id = p_session_id AND status = 'pending'
      AND tenant_id = p_tenant_id AND festival_id = p_festival_id;
  END IF;

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := v_participant->>'chest_number';
    v_name := v_participant->>'name';
    v_items := v_participant->'items';

    -- Clean name format: spaces normalized, full caps
    v_name := UPPER(TRIM(REGEXP_REPLACE(v_name, '\s+', ' ', 'g')));

    -- Detect gender from items
    v_detected_gender := NULL;
    FOR v_item_code IN SELECT * FROM jsonb_array_elements_text(v_items)
    LOOP
      IF v_item_code IN ('UP-012', 'UP-013', 'UP-014', 'UP-015', 'UP-016') THEN
        v_detected_gender := 'Girls';
        EXIT;
      END IF;
    END LOOP;

    -- Check if participant exists with this chest number (scoped to permitted tenant/festival)
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      -- Existing participant
      IF UPPER(TRIM(REGEXP_REPLACE(v_existing_name, '\s+', ' ', 'g'))) <> v_name THEN
        -- CRITICAL: Name mismatch for the same chest number
        v_errors := v_errors || jsonb_build_object(
          'chest_number', v_chest,
          'error', 'Name mismatch for existing chest number',
          'existing_name', v_existing_name,
          'import_name', v_name
        );
        v_skipped_parts := v_skipped_parts + 1;
        CONTINUE; -- Skip this participant completely to prevent corrupting existing records
      ELSE
        -- Same participant, check Gender Conflict or Auto-assign if missing
        v_skipped_parts := v_skipped_parts + 1;

        IF v_detected_gender = 'Girls' THEN
          IF v_existing_gender IS NULL OR TRIM(v_existing_gender) = '' THEN
            UPDATE public.participants SET gender = 'Girls' WHERE id = v_participant_id;
            v_warnings := v_warnings || jsonb_build_object(
              'chest_number', v_chest,
              'warning', 'Girls Auto Assigned to existing participant'
            );
          ELSIF v_existing_gender = 'Boys' THEN
             v_warnings := v_warnings || jsonb_build_object(
              'chest_number', v_chest,
              'warning', 'Gender Conflict: Participant is Boys but registered in Girls-only event'
            );
          END IF;
        END IF;
      END IF;
    ELSE
      -- Create new participant with UP category
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'UP', v_detected_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      IF v_detected_gender = 'Girls' THEN
        v_warnings := v_warnings || jsonb_build_object(
          'chest_number', v_chest,
          'warning', 'Girls Auto Assigned during creation'
        );
      END IF;

      v_imported_parts := v_imported_parts + 1;
    END IF;

    -- Process Items safely
    FOR v_item_code IN SELECT * FROM jsonb_array_elements_text(v_items)
    LOOP
      -- Check if item is valid, belongs to the festival, and is in UP/UPPER PRIMARY or GN category
      SELECT id INTO v_item_id
      FROM public.items
      WHERE festival_id = p_festival_id
        AND item_code = v_item_code
        AND (
          'UPPER PRIMARY' = ANY(category_codes) OR
          'UP' = ANY(category_codes) OR
          'GN' = ANY(category_codes)
        )
      LIMIT 1;

      IF v_item_id IS NOT NULL THEN
        -- Safely insert registration with the dynamically detected festival level
        INSERT INTO public.registrations (
          tenant_id, festival_id, participant_id, item_id, status, level
        ) VALUES (
          p_tenant_id, p_festival_id, v_participant_id, v_item_id, 'approved', v_festival_level
        )
        ON CONFLICT (participant_id, item_id, festival_id) DO NOTHING;

        IF FOUND THEN
          v_imported_regs := v_imported_regs + 1;
        ELSE
          v_skipped_regs := v_skipped_regs + 1;
        END IF;
      ELSE
        -- Log invalid items but DO NOT skip the whole participant (Partial-Safe Import)
        v_invalid_items := v_invalid_items || jsonb_build_object(
          'chest_number', v_chest,
          'item_code', v_item_code,
          'error', 'Item not found or not in UPPER PRIMARY/General category'
        );
      END IF;
    END LOOP;

  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_parts,
    'skipped_participants', v_skipped_parts,
    'imported_registrations', v_imported_regs,
    'skipped_registrations', v_skipped_regs,
    'invalid_items', v_invalid_items,
    'errors', v_errors,
    'warnings', v_warnings
  );
END;
$$;

--------------------------------------------------------------------------------
-- 5. LOWER PRIMARY (LP) IMPORT RPC (071)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_lp_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id text,
  p_participants jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_events jsonb;
  v_event_code text;

  v_participant_id uuid;
  v_existing_name text;
  v_existing_gender text;

  v_detected_gender text;
  v_is_girls_only boolean;

  v_item_id uuid;
  v_item_type text;

  v_imported_participants integer := 0;
  v_skipped_participants integer := 0;
  v_imported_registrations integer := 0;
  v_skipped_registrations integer := 0;
  v_girls_auto_assigned integer := 0;

  v_errors jsonb := '[]'::jsonb;
  v_unmapped jsonb := '[]'::jsonb;
  v_gender_conflicts jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- Loop through participants
  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := trim(v_participant->>'chest_no');
    -- Auto uppercase the name as requested, preserve spelling
    v_name := upper(trim(v_participant->>'name'));
    v_events := v_participant->'events';

    v_detected_gender := NULL;
    v_is_girls_only := false;

    -- Detect Girls-only items for LP: LP-011, LP-012, LP-013, LP-014
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');
      IF v_event_code IN ('LP-011', 'LP-012', 'LP-013', 'LP-014') THEN
        v_is_girls_only := true;
      END IF;
    END LOOP;

    IF v_is_girls_only THEN
      v_detected_gender := 'Girls';
    END IF;

    -- Check if participant already exists BY CHEST NUMBER (scoped to permitted tenant/festival)
    v_participant_id := NULL;
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      v_skipped_participants := v_skipped_participants + 1;

      -- Check gender conflict
      IF v_is_girls_only AND v_existing_gender = 'Boys' THEN
         v_gender_conflicts := v_gender_conflicts || jsonb_build_object('chest', v_chest, 'name', v_name, 'issue', 'Registered in girls-only item but existing gender is Boys');
      END IF;

    ELSE
      -- Create new participant with LP category
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'LP', v_detected_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      IF v_detected_gender = 'Girls' THEN
         v_girls_auto_assigned := v_girls_auto_assigned + 1;
      END IF;

      v_imported_participants := v_imported_participants + 1;
    END IF;

    -- Process registrations
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');

      -- Resolve item mapping (festival-scoped)
      v_item_id := NULL;
      SELECT id, participation_type INTO v_item_id, v_item_type
      FROM public.items
      WHERE festival_id = p_festival_id AND item_code = v_event_code;

      IF v_item_id IS NULL THEN
        -- Missing mapping
        v_unmapped := v_unmapped || jsonb_build_object('chest', v_chest, 'item_code', v_event_code);
        v_skipped_registrations := v_skipped_registrations + 1;
        CONTINUE;
      END IF;

      -- Insert registration
      BEGIN
        INSERT INTO public.registrations (
          tenant_id, festival_id, item_id, participant_id, status
        ) VALUES (
          p_tenant_id, p_festival_id, v_item_id, v_participant_id, 'approved'
        ) ON CONFLICT (participant_id, item_id) DO NOTHING;

        IF FOUND THEN
          v_imported_registrations := v_imported_registrations + 1;
        ELSE
          v_skipped_registrations := v_skipped_registrations + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', 'Registration could not be created');
        v_skipped_registrations := v_skipped_registrations + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_participants,
    'skipped_participants', v_skipped_participants,
    'imported_registrations', v_imported_registrations,
    'skipped_registrations', v_skipped_registrations,
    'girls_auto_assigned', v_girls_auto_assigned,
    'unmapped_events', v_unmapped,
    'gender_conflicts', v_gender_conflicts,
    'errors', v_errors
  );
END;
$$;

--------------------------------------------------------------------------------
-- 6. HIGH SCHOOL (HS) IMPORT RPC (071)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_hs_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id text,
  p_participants jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_events jsonb;
  v_event_code text;

  v_participant_id uuid;
  v_existing_name text;
  v_existing_gender text;

  v_detected_gender text;
  v_is_girls_only boolean;

  v_item_id uuid;
  v_item_type text;

  v_imported_participants integer := 0;
  v_skipped_participants integer := 0;
  v_imported_registrations integer := 0;
  v_skipped_registrations integer := 0;
  v_girls_auto_assigned integer := 0;

  v_errors jsonb := '[]'::jsonb;
  v_unmapped jsonb := '[]'::jsonb;
  v_gender_conflicts jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := trim(v_participant->>'chest_no');
    v_name := upper(trim(v_participant->>'name'));
    v_events := v_participant->'events';

    v_detected_gender := NULL;
    v_is_girls_only := false;

    -- Detect Girls-only items for HS: HS-018 to HS-023
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');
      IF v_event_code IN ('HS-018', 'HS-019', 'HS-020', 'HS-021', 'HS-022', 'HS-023') THEN
        v_is_girls_only := true;
      END IF;
    END LOOP;

    IF v_is_girls_only THEN
      v_detected_gender := 'Girls';
    END IF;

    -- Check if participant already exists BY CHEST NUMBER (scoped to permitted tenant/festival)
    v_participant_id := NULL;
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      v_skipped_participants := v_skipped_participants + 1;
      IF v_is_girls_only AND v_existing_gender = 'Boys' THEN
         v_gender_conflicts := v_gender_conflicts || jsonb_build_object('chest', v_chest, 'name', v_name, 'issue', 'Registered in girls-only item but existing gender is Boys');
      END IF;
    ELSE
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'HS', v_detected_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      IF v_detected_gender = 'Girls' THEN
         v_girls_auto_assigned := v_girls_auto_assigned + 1;
      END IF;

      v_imported_participants := v_imported_participants + 1;
    END IF;

    -- Process registrations
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');

      -- Resolve item mapping (festival-scoped)
      v_item_id := NULL;
      SELECT id, participation_type INTO v_item_id, v_item_type
      FROM public.items
      WHERE festival_id = p_festival_id AND item_code = v_event_code;

      IF v_item_id IS NULL THEN
        v_unmapped := v_unmapped || jsonb_build_object('chest', v_chest, 'item_code', v_event_code);
        v_skipped_registrations := v_skipped_registrations + 1;
        CONTINUE;
      END IF;

      BEGIN
        INSERT INTO public.registrations (
          tenant_id, festival_id, item_id, participant_id, status
        ) VALUES (
          p_tenant_id, p_festival_id, v_item_id, v_participant_id, 'approved'
        ) ON CONFLICT (participant_id, item_id) DO NOTHING;

        IF FOUND THEN
          v_imported_registrations := v_imported_registrations + 1;
        ELSE
          v_skipped_registrations := v_skipped_registrations + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', 'Registration could not be created');
        v_skipped_registrations := v_skipped_registrations + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_participants,
    'skipped_participants', v_skipped_participants,
    'imported_registrations', v_imported_registrations,
    'skipped_registrations', v_skipped_registrations,
    'girls_auto_assigned', v_girls_auto_assigned,
    'unmapped_events', v_unmapped,
    'gender_conflicts', v_gender_conflicts,
    'errors', v_errors
  );
END;
$$;

--------------------------------------------------------------------------------
-- 7. HIGHER SECONDARY (HSS) IMPORT RPC (071)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_hss_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id text,
  p_participants jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_events jsonb;
  v_event_code text;

  v_participant_id uuid;
  v_existing_name text;
  v_existing_gender text;

  v_detected_gender text;
  v_is_girls_only boolean;

  v_item_id uuid;
  v_item_type text;

  v_imported_participants integer := 0;
  v_skipped_participants integer := 0;
  v_imported_registrations integer := 0;
  v_skipped_registrations integer := 0;
  v_girls_auto_assigned integer := 0;

  v_errors jsonb := '[]'::jsonb;
  v_unmapped jsonb := '[]'::jsonb;
  v_gender_conflicts jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := trim(v_participant->>'chest_no');
    v_name := upper(trim(v_participant->>'name'));
    v_events := v_participant->'events';

    v_detected_gender := NULL;
    v_is_girls_only := false;

    -- Detect Girls-only items for HSS: HSS-017 to HSS-020
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');
      IF v_event_code IN ('HSS-017', 'HSS-018', 'HSS-019', 'HSS-020') THEN
        v_is_girls_only := true;
      END IF;
    END LOOP;

    IF v_is_girls_only THEN
      v_detected_gender := 'Girls';
    END IF;

    -- Check if participant already exists BY CHEST NUMBER (scoped to permitted tenant/festival)
    v_participant_id := NULL;
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender
    FROM public.participants
    WHERE festival_id = p_festival_id AND chest_number = v_chest
      AND tenant_id = p_tenant_id;

    IF v_participant_id IS NOT NULL THEN
      v_skipped_participants := v_skipped_participants + 1;
      IF v_is_girls_only AND v_existing_gender = 'Boys' THEN
         v_gender_conflicts := v_gender_conflicts || jsonb_build_object('chest', v_chest, 'name', v_name, 'issue', 'Registered in girls-only item but existing gender is Boys');
      END IF;
    ELSE
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, 'HSS', v_detected_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      IF v_detected_gender = 'Girls' THEN
         v_girls_auto_assigned := v_girls_auto_assigned + 1;
      END IF;

      v_imported_participants := v_imported_participants + 1;
    END IF;

    -- Process registrations
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');

      -- Resolve item mapping (festival-scoped)
      v_item_id := NULL;
      SELECT id, participation_type INTO v_item_id, v_item_type
      FROM public.items
      WHERE festival_id = p_festival_id AND item_code = v_event_code;

      IF v_item_id IS NULL THEN
        v_unmapped := v_unmapped || jsonb_build_object('chest', v_chest, 'item_code', v_event_code);
        v_skipped_registrations := v_skipped_registrations + 1;
        CONTINUE;
      END IF;

      BEGIN
        INSERT INTO public.registrations (
          tenant_id, festival_id, item_id, participant_id, status
        ) VALUES (
          p_tenant_id, p_festival_id, v_item_id, v_participant_id, 'approved'
        ) ON CONFLICT (participant_id, item_id) DO NOTHING;

        IF FOUND THEN
          v_imported_registrations := v_imported_registrations + 1;
        ELSE
          v_skipped_registrations := v_skipped_registrations + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', 'Registration could not be created');
        v_skipped_registrations := v_skipped_registrations + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'imported_participants', v_imported_participants,
    'skipped_participants', v_skipped_participants,
    'imported_registrations', v_imported_registrations,
    'skipped_registrations', v_skipped_registrations,
    'girls_auto_assigned', v_girls_auto_assigned,
    'unmapped_events', v_unmapped,
    'gender_conflicts', v_gender_conflicts,
    'errors', v_errors
  );
END;
$$;

--------------------------------------------------------------------------------
-- 8. GENERAL / CAT-A / CAT-B IMPORT RPC (072)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_general_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id text,
  p_participants jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant jsonb;
  v_chest text;
  v_name text;
  v_category text;
  v_gender text;
  v_participant_id_text text;
  v_events jsonb;
  v_event jsonb;
  v_event_code text;
  v_general_division text;
  v_raw_members jsonb;

  v_participant_id uuid;
  v_item_id uuid;

  v_reused_participants integer := 0;
  v_created_participants integer := 0;
  v_imported_registrations integer := 0;
  v_skipped_registrations integer := 0;

  v_errors jsonb := '[]'::jsonb;
  v_unmapped jsonb := '[]'::jsonb;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- Loop through participants
  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := trim(v_participant->>'chest_no');
    v_name := upper(trim(v_participant->>'name'));
    v_category := trim(v_participant->>'category_code');
    v_gender := v_participant->>'gender';
    v_participant_id_text := v_participant->>'participant_id';
    v_events := v_participant->'events';

    IF v_participant_id_text IS NULL OR v_participant_id_text = '' THEN
      -- Create new participant
      INSERT INTO public.participants (
        tenant_id, festival_id, name, chest_number, category_code, gender, status
      ) VALUES (
        p_tenant_id, p_festival_id, v_name, v_chest, v_category, v_gender, 'approved'
      ) RETURNING id INTO v_participant_id;

      v_created_participants := v_created_participants + 1;
    ELSE
      -- Reuse existing participant: parse id safely and verify ownership
      BEGIN
        v_participant_id := v_participant_id_text::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'error', 'Invalid participant_id provided');
        CONTINUE;
      END;

      IF NOT EXISTS (
        SELECT 1 FROM public.participants
        WHERE id = v_participant_id
          AND tenant_id = p_tenant_id
          AND festival_id = p_festival_id
      ) THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'participant_id', v_participant_id_text, 'error', 'Reused participant does not belong to this tenant/festival');
        CONTINUE;
      END IF;

      v_reused_participants := v_reused_participants + 1;
    END IF;

    -- Process registrations
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event := v_events->i;
      v_event_code := trim(v_event->>'item_code');
      v_general_division := trim(v_event->>'general_division');
      v_raw_members := v_event->'raw_group_members';

      -- Resolve item mapping (festival-scoped)
      v_item_id := NULL;
      SELECT id INTO v_item_id
      FROM public.items
      WHERE festival_id = p_festival_id AND item_code = v_event_code;

      IF v_item_id IS NULL THEN
        -- Missing mapping
        v_unmapped := v_unmapped || jsonb_build_object('chest', v_chest, 'item_code', v_event_code);
        v_skipped_registrations := v_skipped_registrations + 1;
        CONTINUE;
      END IF;

      -- Insert registration
      BEGIN
        INSERT INTO public.registrations (
          tenant_id, festival_id, item_id, participant_id, status, general_division, raw_group_members
        ) VALUES (
          p_tenant_id, p_festival_id, v_item_id, v_participant_id, 'approved', v_general_division, v_raw_members
        ) ON CONFLICT (participant_id, item_id) DO NOTHING;

        IF FOUND THEN
          v_imported_registrations := v_imported_registrations + 1;
        ELSE
          v_skipped_registrations := v_skipped_registrations + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', 'Registration could not be created');
        v_skipped_registrations := v_skipped_registrations + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'reused_participants', v_reused_participants,
    'created_participants', v_created_participants,
    'imported_registrations', v_imported_registrations,
    'skipped_registrations', v_skipped_registrations,
    'unmapped_events', v_unmapped,
    'errors', v_errors
  );
END;
$$;

--------------------------------------------------------------------------------
-- 9. SCHEDULE IMPORT RPC (061)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_schedule_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_schedules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule jsonb;
  v_category text;
  v_venue_name text;
  v_item_name text;
  v_item_code text;
  v_section text;
  v_date text;
  v_start_str text;
  v_end_str text;
  v_duration int;
  v_stage_order int;
  v_max_parts int;
  v_status text;

  v_item_id uuid;
  v_db_item_name text;
  v_item_categories text[];
  v_venue_id uuid;

  v_start_time timestamptz;
  v_end_time timestamptz;

  v_imported_count int := 0;
  v_skipped_count int := 0;
  v_conflict_count int := 0;
  v_invalid_count int := 0;

  v_errors jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_db_overlap_item text;
BEGIN
  -- C1: authorization gate (authenticated admin, tenant hierarchy, festival ownership)
  PERFORM public._assert_import_access(p_tenant_id, p_festival_id);

  -- 1. Scoped Advisory Lock to prevent concurrent scheduling operations
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text || 'schedules'));

  FOR v_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    v_category := v_schedule->>'category';
    v_venue_name := v_schedule->>'venue';
    v_item_name := v_schedule->>'item_name';
    v_item_code := v_schedule->>'item_code';
    v_section := v_schedule->>'section';
    v_date := v_schedule->>'date';
    v_start_str := v_schedule->>'start_time';
    v_end_str := v_schedule->>'end_time';
    v_duration := (v_schedule->>'duration_minutes')::int;
    v_stage_order := (v_schedule->>'stage_order')::int;
    v_max_parts := (v_schedule->>'max_participants')::int;
    v_status := COALESCE(v_schedule->>'status', 'scheduled');

    -- Validate Item Code & Category (festival-scoped)
    SELECT id, item_name_en, category_codes INTO v_item_id, v_db_item_name, v_item_categories
    FROM public.items
    WHERE festival_id = p_festival_id AND item_code = v_item_code AND is_active = true
    LIMIT 1;

    IF v_item_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'error', 'Item code not found in active festival items'
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Validate Item Name matches exactly (English)
    IF LOWER(TRIM(v_db_item_name)) <> LOWER(TRIM(v_item_name)) THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'error', 'Item name mismatch. DB expects: ' || v_db_item_name
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Validate Category matches
    IF NOT (v_category = ANY(v_item_categories) OR v_category = 'GENERAL' OR 'GN' = ANY(v_item_categories)) THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'error', 'Category mismatch. Item expects: ' || array_to_string(v_item_categories, ', ')
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Validate Venue (belongs to permitted festival/tenant)
    SELECT id INTO v_venue_id
    FROM public.venues
    WHERE festival_id = p_festival_id AND tenant_id = p_tenant_id
      AND LOWER(TRIM(name)) = LOWER(TRIM(v_venue_name))
    LIMIT 1;

    IF v_venue_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'venue', v_venue_name,
        'error', 'Venue not found in active festival. Please create venue first.'
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END IF;

    -- Parse timestamps safely
    BEGIN
      v_start_time := to_timestamp(v_date || ' ' || v_start_str, 'YYYY-MM-DD HH:12:MI AM');
      v_end_time := to_timestamp(v_date || ' ' || v_end_str, 'YYYY-MM-DD HH:12:MI AM');
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'item_code', v_item_code,
        'error', 'Invalid date or time format. Expected YYYY-MM-DD and HH:MM AM/PM'
      );
      v_invalid_count := v_invalid_count + 1;
      CONTINUE;
    END;

    -- Check database overlaps/conflicts (same venue + overlapping time range)
    SELECT i.item_name_en INTO v_db_overlap_item
    FROM public.schedules s
    JOIN public.items i ON i.id = s.item_id
    WHERE s.festival_id = p_festival_id
      AND s.venue_id = v_venue_id
      AND s.start_time < v_end_time
      AND s.end_time > v_start_time
      AND s.item_id <> v_item_id -- exclude same item reschedule if identical
    LIMIT 1;

    IF v_db_overlap_item IS NOT NULL THEN
      v_conflicts := v_conflicts || jsonb_build_object(
        'item_code', v_item_code,
        'item_name', v_item_name,
        'venue', v_venue_name,
        'conflict_with', v_db_overlap_item,
        'start_time', v_start_str,
        'end_time', v_end_str,
        'error', 'Overlap detected with already scheduled item: ' || v_db_overlap_item
      );
      v_conflict_count := v_conflict_count + 1;
      CONTINUE; -- Block conflicting row
    END IF;

    -- Safe Insert schedule slot
    INSERT INTO public.schedules (
      tenant_id, festival_id, item_id, venue_id, start_time, end_time, status
    ) VALUES (
      p_tenant_id, p_festival_id, v_item_id, v_venue_id, v_start_time, v_end_time, v_status
    )
    ON CONFLICT (festival_id, venue_id, item_id, start_time, end_time) DO NOTHING;

    IF FOUND THEN
      v_imported_count := v_imported_count + 1;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'imported_count', v_imported_count,
    'skipped_count', v_skipped_count,
    'conflict_count', v_conflict_count,
    'invalid_count', v_invalid_count,
    'errors', v_errors,
    'conflicts', v_conflicts
  );
END;
$$;

--------------------------------------------------------------------------------
-- 10. GRANT HYGIENE: revoke PUBLIC/anon, grant only to authenticated
--------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.execute_junior_import_chunk(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_junior_import_chunk(uuid, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_junior_import_chunk(uuid, uuid, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_senior_import_chunk(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_senior_import_chunk(uuid, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_senior_import_chunk(uuid, uuid, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_upper_primary_import_chunk(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_upper_primary_import_chunk(uuid, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_upper_primary_import_chunk(uuid, uuid, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_lp_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_lp_import_chunk(uuid, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_lp_import_chunk(uuid, uuid, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_hs_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_hs_import_chunk(uuid, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_hs_import_chunk(uuid, uuid, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_hss_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_hss_import_chunk(uuid, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_hss_import_chunk(uuid, uuid, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_general_import_chunk(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_general_import_chunk(uuid, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_general_import_chunk(uuid, uuid, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.execute_schedule_import_chunk(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_schedule_import_chunk(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_schedule_import_chunk(uuid, uuid, jsonb) TO authenticated;
