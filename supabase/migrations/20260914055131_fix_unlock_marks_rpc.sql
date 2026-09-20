BEGIN;

CREATE OR REPLACE FUNCTION public.unlock_schedule_marks(
  p_schedule_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Unlock ONLY mark entries for active judges
  UPDATE public.mark_entries m
  SET is_final = false
  WHERE m.schedule_id = p_schedule_id
    AND EXISTS (
      SELECT 1 FROM public.schedule_judge_assignments a
      WHERE a.schedule_id = m.schedule_id
        AND a.judge_id = m.judge_id
        AND a.tenant_id = m.tenant_id
        AND a.status = 'active'
    );

  -- 2. Revert results status to draft if it's already published or ready
  UPDATE public.results
  SET result_status = 'draft',
      published = false
  WHERE schedule_id = p_schedule_id
    AND result_status IN ('published', 'ready');
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_schedule_marks(UUID) TO authenticated;

COMMIT;
