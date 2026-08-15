-- Secure and atomic bulk schedule creation.
-- The client may preview timings, but the database is the final authority for
-- tenant/festival/item/venue ownership and duplicate item protection.

BEGIN;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS bulk_break_context jsonb;

CREATE OR REPLACE FUNCTION public.bulk_create_schedules(
  p_festival_id uuid,
  p_schedules jsonb
)
RETURNS SETOF public.schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_row jsonb;
  v_item_id uuid;
  v_venue_id uuid;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_status text;
  v_buffer_minutes integer;
  v_expected_judge_count integer;
  v_break_context jsonb;
  v_schedule public.schedules%ROWTYPE;
  v_seen_items uuid[] := ARRAY[]::uuid[];
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array'
     OR jsonb_array_length(p_schedules) = 0 THEN
    RAISE EXCEPTION 'At least one schedule is required.'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_schedules) > 200 THEN
    RAISE EXCEPTION 'Bulk schedule creation is limited to 200 items per request.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar f
    WHERE f.id = p_festival_id
      AND f.tenant_id = v_tenant_id
      AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.'
      USING ERRCODE = '42501';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_schedules)
  LOOP
    v_item_id := NULLIF(v_row ->> 'item_id', '')::uuid;
    v_venue_id := NULLIF(v_row ->> 'venue_id', '')::uuid;
    v_start_time := NULLIF(v_row ->> 'start_time', '')::timestamptz;
    v_end_time := NULLIF(v_row ->> 'end_time', '')::timestamptz;
    v_status := COALESCE(NULLIF(v_row ->> 'status', ''), 'scheduled');
    v_buffer_minutes := GREATEST(0, COALESCE(NULLIF(v_row ->> 'buffer_minutes', '')::integer, 0));
    v_expected_judge_count := COALESCE(NULLIF(v_row ->> 'expected_judge_count', '')::integer, 3);
    v_break_context := v_row -> 'bulk_break_context';

    IF v_item_id IS NULL OR v_venue_id IS NULL OR v_start_time IS NULL OR v_end_time IS NULL THEN
      RAISE EXCEPTION 'Every bulk schedule requires item, venue, start time, and end time.'
        USING ERRCODE = '22023';
    END IF;

    IF v_end_time <= v_start_time THEN
      RAISE EXCEPTION 'Schedule end time must be later than start time.'
        USING ERRCODE = '22023';
    END IF;

    IF v_expected_judge_count < 1 OR v_expected_judge_count > 5 THEN
      RAISE EXCEPTION 'Expected judge count must be between 1 and 5.'
        USING ERRCODE = '22023';
    END IF;

    IF v_break_context IS NOT NULL AND jsonb_typeof(v_break_context) <> 'array' THEN
      RAISE EXCEPTION 'Break context must be an array.'
        USING ERRCODE = '22023';
    END IF;

    IF v_item_id = ANY(v_seen_items) THEN
      RAISE EXCEPTION 'The same competition item cannot be added twice in one bulk request.'
        USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.schedules s
      WHERE s.tenant_id = v_tenant_id
        AND s.festival_id = p_festival_id
        AND s.item_id = v_item_id
    ) THEN
      RAISE EXCEPTION 'This competition item is already scheduled in the selected festival.'
        USING ERRCODE = '23505';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.items i
      WHERE i.id = v_item_id
        AND COALESCE(i.is_active, true) IS TRUE
        AND (i.tenant_id = v_tenant_id OR i.tenant_id IS NULL)
        AND (i.festival_id = p_festival_id OR i.festival_id IS NULL)
    ) THEN
      RAISE EXCEPTION 'The selected competition item is invalid for this festival.'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = v_venue_id
        AND v.tenant_id = v_tenant_id
        AND (
          v.festival_id = p_festival_id
          OR (
            v.festival_id IS NULL
            AND (
              SELECT count(*)
              FROM public.festival_calendar legacy_festival
              WHERE legacy_festival.tenant_id = v_tenant_id
                AND legacy_festival.is_active IS TRUE
            ) = 1
          )
        )
    ) THEN
      RAISE EXCEPTION 'The selected venue is invalid for this festival.'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.schedules (
      tenant_id,
      festival_id,
      item_id,
      venue_id,
      start_time,
      end_time,
      status,
      buffer_minutes,
      expected_judge_count,
      bulk_break_context
    ) VALUES (
      v_tenant_id,
      p_festival_id,
      v_item_id,
      v_venue_id,
      v_start_time,
      v_end_time,
      v_status,
      v_buffer_minutes,
      v_expected_judge_count,
      v_break_context
    )
    RETURNING * INTO v_schedule;

    v_seen_items := array_append(v_seen_items, v_item_id);
    RETURN NEXT v_schedule;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_create_schedules(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_create_schedules(uuid, jsonb) TO authenticated;

-- Remove broad direct table policies. Tenant/admin policies and the narrow
-- public active-schedule policies remain in place.
DROP POLICY IF EXISTS "Allow all on schedules" ON public.schedules;
DROP POLICY IF EXISTS "Allow read schedules" ON public.schedules;
DROP POLICY IF EXISTS "authenticated_read_schedules" ON public.schedules;
DROP POLICY IF EXISTS schedules_delete_policy ON public.schedules;
DROP POLICY IF EXISTS schedules_insert_policy ON public.schedules;
DROP POLICY IF EXISTS schedules_select_policy ON public.schedules;
DROP POLICY IF EXISTS schedules_update_policy ON public.schedules;

DROP POLICY IF EXISTS "Allow all on venues" ON public.venues;
DROP POLICY IF EXISTS "Allow read venues" ON public.venues;
DROP POLICY IF EXISTS "authenticated_read_venues" ON public.venues;
DROP POLICY IF EXISTS venues_delete_policy ON public.venues;
DROP POLICY IF EXISTS venues_insert_policy ON public.venues;
DROP POLICY IF EXISTS venues_select_policy ON public.venues;
DROP POLICY IF EXISTS venues_update_policy ON public.venues;

COMMIT;
