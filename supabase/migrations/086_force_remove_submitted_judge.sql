-- Allow an administrator to explicitly remove a judge who has already
-- submitted final marks. Marks remain in the audit/history tables but are
-- excluded from readiness and result calculations because the assignment is
-- no longer active.

BEGIN;

CREATE OR REPLACE FUNCTION public.remove_schedule_judge(
  p_schedule_id uuid,
  p_judge_id uuid,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_has_final_marks boolean;
BEGIN
  SELECT a.tenant_id
  INTO v_tenant_id
  FROM public.schedule_judge_assignments a
  WHERE a.schedule_id = p_schedule_id
    AND a.judge_id = p_judge_id
    AND a.status = 'active'
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'This judge is not actively assigned to the event.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to modify this judge panel.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.mark_entries me
    WHERE me.schedule_id = p_schedule_id
      AND me.judge_id = p_judge_id
      AND me.is_final = true
  )
  INTO v_has_final_marks;

  IF v_has_final_marks AND NOT p_force THEN
    RAISE EXCEPTION
      'FINAL_MARKS_CONFIRMATION_REQUIRED: This judge has submitted final marks.';
  END IF;

  UPDATE public.schedule_judge_assignments
  SET status = 'removed',
      removed_at = now(),
      removed_by = auth.uid(),
      removal_reason = CASE
        WHEN v_has_final_marks
          THEN 'Force removed by administrator after final marks submission'
        ELSE 'Removed by administrator'
      END
  WHERE schedule_id = p_schedule_id
    AND judge_id = p_judge_id
    AND status = 'active';

  UPDATE public.judge_tokens
  SET is_revoked = true,
      revoked_at = now(),
      revoked_by = auth.uid(),
      revocation_reason = 'Judge removed from event panel',
      status = CASE
        WHEN status IN ('created', 'pending_approval', 'approved')
          THEN 'rejected'
        ELSE status
      END
  WHERE schedule_id = p_schedule_id
    AND judge_id = p_judge_id
    AND is_used = false
    AND is_revoked IS NOT TRUE;

  RETURN jsonb_build_object(
    'removed', true,
    'had_final_marks', v_has_final_marks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_schedule_judge(uuid, uuid, boolean)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_schedule_judge(uuid, uuid, boolean)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
