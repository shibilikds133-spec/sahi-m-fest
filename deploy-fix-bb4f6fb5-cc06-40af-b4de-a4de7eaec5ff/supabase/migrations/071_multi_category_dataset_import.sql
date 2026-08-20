-- 070_multi_category_dataset_import.sql
-- Safely imports LP, HS, HSS datasets with dynamic level detection and gender auto-assignment

-------------------------------------------------------------------------------
-- LOWER PRIMARY (LP) IMPORT FUNCTION
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_lp_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id text,
  p_participants jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

    -- Check if participant already exists BY CHEST NUMBER
    v_participant_id := NULL;
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender 
    FROM public.participants 
    WHERE festival_id = p_festival_id AND chest_number = v_chest;
    
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
      
      -- Resolve item mapping
      v_item_id := NULL;
      SELECT id, participation_type INTO v_item_id, v_item_type 
      FROM public.items 
      WHERE tenant_id = p_tenant_id AND item_code = v_event_code;
      
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
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', SQLERRM);
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


-------------------------------------------------------------------------------
-- HIGH SCHOOL (HS) IMPORT FUNCTION
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_hs_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id text,
  p_participants jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

    v_participant_id := NULL;
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender 
    FROM public.participants 
    WHERE festival_id = p_festival_id AND chest_number = v_chest;
    
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

    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');
      
      v_item_id := NULL;
      SELECT id, participation_type INTO v_item_id, v_item_type 
      FROM public.items 
      WHERE tenant_id = p_tenant_id AND item_code = v_event_code;
      
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
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', SQLERRM);
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


-------------------------------------------------------------------------------
-- HIGHER SECONDARY (HSS) IMPORT FUNCTION
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_hss_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_session_id text,
  p_participants jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

    v_participant_id := NULL;
    SELECT id, name, gender INTO v_participant_id, v_existing_name, v_existing_gender 
    FROM public.participants 
    WHERE festival_id = p_festival_id AND chest_number = v_chest;
    
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

    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event_code := trim(v_events->i->>'item_code');
      
      v_item_id := NULL;
      SELECT id, participation_type INTO v_item_id, v_item_type 
      FROM public.items 
      WHERE tenant_id = p_tenant_id AND item_code = v_event_code;
      
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
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', SQLERRM);
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
