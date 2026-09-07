-- SUPABASE MIGRATION 083 — UNLOCK JUDGE MARKS RPC
-- Safely unlocks finalized marks for re-entry and resets published results to draft

BEGIN;

CREATE OR REPLACE FUNCTION public.unlock_judge_marks(
  p_schedule_id UUID,
  p_judge_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Unlock the mark entries for the specified schedule and judge
  UPDATE public.mark_entries
  SET is_final = false
  WHERE schedule_id = p_schedule_id
    AND judge_id = p_judge_id;

  -- 2. Revert results status to draft if it's already published or ready
  -- This ensures the public doesn't see outdated results while marks are being edited.
  UPDATE public.results
  SET status = 'draft'
  WHERE schedule_id = p_schedule_id
    AND status IN ('published', 'ready');
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_judge_marks(UUID, UUID) TO authenticated;

COMMIT;
