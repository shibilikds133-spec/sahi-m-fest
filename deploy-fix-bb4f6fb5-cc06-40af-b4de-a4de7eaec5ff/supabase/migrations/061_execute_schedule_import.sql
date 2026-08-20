-- 060_execute_schedule_import.sql
-- Safely processes chunk of schedule imports with overlap validation and rigorous constraints

CREATE OR REPLACE FUNCTION public.execute_schedule_import_chunk(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_schedules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

    -- Validate Item Code & Category
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

    -- Validate Venue
    SELECT id INTO v_venue_id
    FROM public.venues
    WHERE festival_id = p_festival_id AND LOWER(TRIM(name)) = LOWER(TRIM(v_venue_name))
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
