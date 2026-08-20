-- 058_senior_dataset_import.sql
-- Safely imports Senior dataset with dynamic level detection and validation

-- Create execute_senior_import_chunk RPC
CREATE OR REPLACE FUNCTION public.execute_senior_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id uuid,
  p_participants jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  -- 1. Scoped Advisory Lock
  -- Lock to prevent concurrent imports on the same festival
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text));

  -- 2. Detect Festival Level
  SELECT COALESCE(level, 'sector') INTO v_festival_level 
  FROM public.festival_calendar 
  WHERE id = p_festival_id 
  LIMIT 1;

  -- Ensure session is valid
  IF p_session_id IS NOT NULL THEN
    UPDATE public.import_sessions 
    SET status = 'processing' 
    WHERE id = p_session_id AND status = 'pending';
  END IF;

  FOR v_participant IN SELECT * FROM jsonb_array_elements(p_participants)
  LOOP
    v_chest := v_participant->>'chest_number';
    v_name := v_participant->>'name';
    v_items := v_participant->'items';

    -- Clean name format: spaces normalized, full caps (though frontend does it too)
    v_name := UPPER(TRIM(REGEXP_REPLACE(v_name, '\s+', ' ', 'g')));

    -- Check if participant exists with this chest number in the active festival
    SELECT id, name INTO v_participant_id, v_existing_name 
    FROM public.participants 
    WHERE festival_id = p_festival_id AND chest_number = v_chest;

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
