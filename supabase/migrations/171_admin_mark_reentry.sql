-- 171_admin_mark_reentry.sql
-- Safely allows admins to bypass judge tokens and edit marks for any schedule.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_upsert_mark(
  p_schedule_id UUID,
  p_judge_id UUID,
  p_registration_id UUID,
  p_criteria_scores JSONB,
  p_total_mark NUMERIC,
  p_max_mark NUMERIC,
  p_criteria_snapshot JSONB,
  p_status TEXT -- 'draft' or 'final'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_result JSONB;
BEGIN
  -- 1. Strict Admin Check (Bypasses Judge Token entirely)
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can use the manual mark re-entry portal.';
  END IF;

  -- 2. Upsert the mark entry
  -- We assume marks are already unlocked by unlock_schedule_marks(), but admins can override anyway.
  WITH saved_mark AS (
    INSERT INTO public.mark_entries (
      schedule_id,
      judge_id,
      registration_id,
      criteria_scores,
      total_mark,
      entry_mode_snapshot,
      max_mark_snapshot,
      criteria_snapshot,
      is_draft,
      is_final,
      submitted_at,
      updated_at
    ) VALUES (
      p_schedule_id,
      p_judge_id,
      p_registration_id,
      COALESCE(p_criteria_scores, '{}'::jsonb),
      p_total_mark,
      'criteria', -- Always assuming criteria mode for this UI, or adapt if needed
      COALESCE(p_max_mark, 100),
      COALESCE(p_criteria_snapshot, '[]'::jsonb),
      (p_status = 'draft'),
      (p_status = 'final'),
      CASE WHEN p_status = 'final' THEN now() ELSE NULL END,
      now()
    )
    ON CONFLICT (schedule_id, judge_id, registration_id)
    DO UPDATE SET
      criteria_scores = EXCLUDED.criteria_scores,
      total_mark = EXCLUDED.total_mark,
      entry_mode_snapshot = EXCLUDED.entry_mode_snapshot,
      max_mark_snapshot = EXCLUDED.max_mark_snapshot,
      criteria_snapshot = EXCLUDED.criteria_snapshot,
      is_draft = EXCLUDED.is_draft,
      is_final = EXCLUDED.is_final,
      submitted_at = COALESCE(public.mark_entries.submitted_at, EXCLUDED.submitted_at),
      updated_at = EXCLUDED.updated_at
    RETURNING *
  )
  SELECT jsonb_build_object(
    'id', m.id,
    'schedule_id', m.schedule_id,
    'judge_id', m.judge_id,
    'registration_id', m.registration_id,
    'is_draft', m.is_draft,
    'is_final', m.is_final,
    'total_mark', m.total_mark,
    'updated_at', m.updated_at
  ) INTO v_result
  FROM saved_mark m;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_mark(UUID, UUID, UUID, JSONB, NUMERIC, NUMERIC, JSONB, TEXT) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
