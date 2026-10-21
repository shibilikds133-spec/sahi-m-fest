-- Keep finalized judge marks intact when an administrator opens result editing.
-- A subsequent edit is scoped to the one schedule/judge/registration row saved.

BEGIN;

CREATE OR REPLACE FUNCTION public.unlock_schedule_marks(p_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT s.tenant_id
  INTO v_tenant_id
  FROM public.schedules s
  WHERE s.id = p_schedule_id;

  IF NOT FOUND OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Schedule was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_superadmin IS TRUE
        OR p.role = 'super_admin'
        OR (
          p.role IN ('tenant_admin', 'festival_admin', 'admin')
          AND p.tenant_id = v_tenant_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Administrator access to this tenant is required.'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize with result publication only after confirming tenant access.
  PERFORM 1
  FROM public.schedules s
  WHERE s.id = p_schedule_id
    AND s.tenant_id = v_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule changed while enabling mark editing.' USING ERRCODE = '40001';
  END IF;

  -- Deliberately do not update mark_entries or change any is_final flag.
  -- Results are withdrawn so clients cannot see stale scores during correction.
  UPDATE public.results r
  SET result_status = 'draft',
      published = false
  WHERE r.schedule_id = p_schedule_id
    AND r.result_status IN ('published', 'ready');
END;
$$;

REVOKE ALL ON FUNCTION public.unlock_schedule_marks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlock_schedule_marks(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_mark(
  p_schedule_id uuid,
  p_judge_id uuid,
  p_registration_id uuid,
  p_criteria_scores jsonb,
  p_total_mark numeric,
  p_max_mark numeric,
  p_criteria_snapshot jsonb,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_schedule public.schedules%ROWTYPE;
  v_mark public.mark_entries%ROWTYPE;
  v_existing_id uuid;
  v_existing_is_final boolean;
  v_entry_mode text;
  v_scores jsonb;
  v_snapshot jsonb;
BEGIN
  SELECT s.*
  INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id;

  IF NOT FOUND OR v_schedule.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Schedule was not found.' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_superadmin IS TRUE
        OR p.role = 'super_admin'
        OR (
          p.role IN ('tenant_admin', 'festival_admin', 'admin')
          AND p.tenant_id = v_schedule.tenant_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Administrator access to this tenant is required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_status IS DISTINCT FROM 'final' THEN
    RAISE EXCEPTION 'Administrator mark corrections must remain finalized.';
  END IF;
  IF p_total_mark IS NULL OR p_max_mark IS NULL OR p_max_mark <= 0
     OR p_total_mark < 0 OR p_total_mark > p_max_mark THEN
    RAISE EXCEPTION 'Mark must be within its configured maximum.';
  END IF;

  v_scores := COALESCE(p_criteria_scores, '{}'::jsonb);
  v_snapshot := COALESCE(p_criteria_snapshot, '[]'::jsonb);
  IF jsonb_typeof(v_scores) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_snapshot) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid scoring data.';
  END IF;
  v_entry_mode := CASE WHEN v_scores = '{}'::jsonb THEN 'total_only' ELSE 'criteria' END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    JOIN public.judges j ON j.id = a.judge_id AND j.tenant_id = a.tenant_id
    WHERE a.schedule_id = p_schedule_id
      AND a.judge_id = p_judge_id
      AND a.tenant_id = v_schedule.tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected judge is not actively assigned to this schedule.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM scoring_private.eligible(v_schedule) r
    WHERE r.id = p_registration_id
  ) THEN
    RAISE EXCEPTION 'Registration is outside this schedule or is not eligible.'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize saves to this exact judge/registration mark. No other mark row
  -- for the schedule is touched by this function.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_schedule_id::text || ':' || p_judge_id::text || ':' || p_registration_id::text,
    0
  ));

  SELECT m.id, m.is_final
  INTO v_existing_id, v_existing_is_final
  FROM public.mark_entries m
  WHERE m.schedule_id = p_schedule_id
    AND m.judge_id = p_judge_id
    AND m.registration_id = p_registration_id
    AND m.tenant_id = v_schedule.tenant_id
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    -- The existing validator permits reopening a finalized row only when that
    -- statement changes is_final alone. Both statements run in this RPC's
    -- transaction; the committed row is final again, or the whole save rolls back.
    IF v_existing_is_final IS TRUE THEN
      UPDATE public.mark_entries
      SET is_final = false
      WHERE id = v_existing_id;
    END IF;

    UPDATE public.mark_entries
    SET criteria_scores = v_scores,
        total_mark = p_total_mark,
        entry_mode_snapshot = v_entry_mode,
        max_mark_snapshot = p_max_mark,
        criteria_snapshot = v_snapshot,
        is_draft = false,
        is_final = true,
        submitted_at = COALESCE(submitted_at, now()),
        updated_at = now()
    WHERE id = v_existing_id
    RETURNING * INTO v_mark;
  ELSE
    INSERT INTO public.mark_entries (
      tenant_id, schedule_id, judge_id, registration_id,
      criteria_scores, total_mark, entry_mode_snapshot,
      max_mark_snapshot, criteria_snapshot, is_draft, is_final,
      submitted_at, updated_at
    ) VALUES (
      v_schedule.tenant_id, p_schedule_id, p_judge_id, p_registration_id,
      v_scores, p_total_mark, v_entry_mode,
      p_max_mark, v_snapshot, false, true, now(), now()
    )
    RETURNING * INTO v_mark;
  END IF;

  RETURN jsonb_build_object(
    'id', v_mark.id,
    'schedule_id', v_mark.schedule_id,
    'judge_id', v_mark.judge_id,
    'registration_id', v_mark.registration_id,
    'is_draft', v_mark.is_draft,
    'is_final', v_mark.is_final,
    'total_mark', v_mark.total_mark,
    'updated_at', v_mark.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_mark(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_mark(uuid, uuid, uuid, jsonb, numeric, numeric, jsonb, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
