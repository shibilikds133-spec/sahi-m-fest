-- 057_junior_dataset_import.sql
-- Safely imports Junior dataset

-- 1. Create import_sessions table
CREATE TABLE IF NOT EXISTS public.import_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
    filename text,
    status text DEFAULT 'pending', -- pending, processing, completed, partial, failed, cancelled, rolled_back
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    participants_count int DEFAULT 0,
    registrations_count int DEFAULT 0,
    skipped_count int DEFAULT 0,
    error_count int DEFAULT 0,
    warning_count int DEFAULT 0,
    report_json jsonb DEFAULT '{}'::jsonb,
    created_by uuid
);

-- Enable RLS
ALTER TABLE public.import_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage import_sessions" ON public.import_sessions;

CREATE POLICY "Users can manage import_sessions"
  ON public.import_sessions
  FOR ALL
  USING (
    tenant_id = public.get_my_tenant_id() OR public.is_superadmin()
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id() OR public.is_superadmin()
  );

-- 2. Create Unique Registration Guard
CREATE UNIQUE INDEX IF NOT EXISTS unique_registration 
ON public.registrations(participant_id, item_id, festival_id);

-- 3. Create Unique Chest Number Guard (Partial)
-- Since `deleted_at` doesn't exist, we omit WHERE deleted_at IS NULL
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_chest_number 
ON public.participants(chest_number, festival_id);

-- 4. Execute RPC
CREATE OR REPLACE FUNCTION public.execute_junior_import_chunk(
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
  
  v_imported_parts int := 0;
  v_skipped_parts int := 0;
  v_imported_regs int := 0;
  v_skipped_regs int := 0;
  
  v_invalid_items jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- 4a. Scoped Advisory Lock
  -- Lock to prevent concurrent imports on the same festival
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || p_festival_id::text));

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

    -- Check if participant exists
    SELECT id, name INTO v_participant_id, v_existing_name 
    FROM public.participants 
    WHERE festival_id = p_festival_id AND chest_number = v_chest;

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
