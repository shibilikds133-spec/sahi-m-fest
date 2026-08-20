-- 071_general_category_import.sql
-- Safely imports General, CAT-A, CAT-B events with existing participant reuse or safe creation

ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS general_division text;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS raw_group_members jsonb;

CREATE OR REPLACE FUNCTION public.execute_general_import_chunk(
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
      -- Reuse existing participant
      v_participant_id := v_participant_id_text::uuid;
      v_reused_participants := v_reused_participants + 1;
    END IF;

    -- Process registrations
    FOR i IN 0 .. jsonb_array_length(v_events) - 1 LOOP
      v_event := v_events->i;
      v_event_code := trim(v_event->>'item_code');
      v_general_division := trim(v_event->>'general_division');
      v_raw_members := v_event->'raw_group_members';
      
      -- Resolve item mapping
      v_item_id := NULL;
      SELECT id INTO v_item_id 
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
        v_errors := v_errors || jsonb_build_object('chest', v_chest, 'item_code', v_event_code, 'error', SQLERRM);
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
