-- SUPABASE MIGRATION 084 — UNLOCK SCHEDULE MARKS RPC
-- Safely unlocks ALL finalized marks for a schedule and resets published results to draft

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
  -- 1. Unlock ALL mark entries for the specified schedule
  UPDATE public.mark_entries
  SET is_final = false
  WHERE schedule_id = p_schedule_id;

  -- 2. Revert results status to draft if it's already published or ready
  UPDATE public.results
  SET status = 'draft'
  WHERE schedule_id = p_schedule_id
    AND status IN ('published', 'ready');
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlock_schedule_marks(UUID) TO authenticated;

COMMIT;
