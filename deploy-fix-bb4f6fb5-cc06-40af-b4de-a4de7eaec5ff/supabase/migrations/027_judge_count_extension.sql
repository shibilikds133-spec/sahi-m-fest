-- ============================================================
-- Migration 026: Flexible Judge Count Extension
-- Adds expected_judge_count to schedules and a readiness RPC.
-- Does NOT modify any existing mark entry or result logic.
-- ============================================================

-- 1. Add expected judge count to schedules (default 3 = backward compat)
ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS expected_judge_count int NOT NULL DEFAULT 3
  CHECK (expected_judge_count BETWEEN 1 AND 5);

-- 2. View: per-submission status (judge name, submitted/draft, timestamp)
CREATE OR REPLACE VIEW judge_submission_status AS
SELECT
  me.schedule_id,
  me.registration_id,
  me.judge_id,
  j.name          AS judge_name,
  me.total_mark,
  me.is_final,
  me.is_draft,
  me.submitted_at,
  s.expected_judge_count
FROM mark_entries me
JOIN judges   j ON j.id = me.judge_id
JOIN schedules s ON s.id = me.schedule_id;

GRANT SELECT ON judge_submission_status TO authenticated;

-- 3. RPC: per-participant readiness status for a given schedule
CREATE OR REPLACE FUNCTION public.get_schedule_readiness(p_schedule_id uuid)
RETURNS TABLE (
  registration_id   uuid,
  code_letter       text,
  submitted_count   bigint,
  pending_count     bigint,
  expected_count    int,
  all_submitted     boolean,
  readiness_status  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    reg.id                                                                        AS registration_id,
    reg.code_letter,
    COUNT(me.id) FILTER (WHERE me.is_final = true)                               AS submitted_count,
    (s.expected_judge_count
      - COUNT(me.id) FILTER (WHERE me.is_final = true))                          AS pending_count,
    s.expected_judge_count                                                        AS expected_count,
    COUNT(me.id) FILTER (WHERE me.is_final = true) >= s.expected_judge_count     AS all_submitted,
    CASE
      WHEN COUNT(me.id) FILTER (WHERE me.is_final = true) >= s.expected_judge_count
        THEN 'Ready for Calculation'
      WHEN COUNT(me.id) FILTER (WHERE me.is_final = true) > 0
        THEN 'Partially Submitted'
      ELSE 'Waiting for Judges'
    END                                                                           AS readiness_status
  FROM registrations reg
  CROSS JOIN schedules s
  LEFT JOIN mark_entries me
         ON me.registration_id = reg.id
        AND me.schedule_id     = p_schedule_id
  WHERE s.id          = p_schedule_id
    AND reg.item_id   = s.item_id
    AND reg.code_letter IS NOT NULL
  GROUP BY reg.id, reg.code_letter, s.expected_judge_count;
$$;

GRANT EXECUTE ON FUNCTION public.get_schedule_readiness(uuid) TO authenticated;

-- 4. RPC: per-judge submission summary for a schedule
CREATE OR REPLACE FUNCTION public.get_judge_submission_summary(p_schedule_id uuid)
RETURNS TABLE (
  judge_id        uuid,
  judge_name      text,
  submitted_count bigint,
  draft_count     bigint,
  total_assigned  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH reg_count AS (
    SELECT COUNT(r.id)::bigint AS total_regs
    FROM registrations r
    JOIN schedules s ON s.id = p_schedule_id
    WHERE r.item_id = s.item_id AND r.code_letter IS NOT NULL
  )
  SELECT
    j.id                                               AS judge_id,
    j.name                                             AS judge_name,
    COUNT(me.id) FILTER (WHERE me.is_final = true)     AS submitted_count,
    COUNT(me.id) FILTER (WHERE me.is_draft = true)     AS draft_count,
    rc.total_regs                                      AS total_assigned
  FROM judges j
  -- Only judges that have a token for this schedule (i.e. assigned)
  JOIN judge_tokens jt ON jt.judge_id = j.id AND jt.schedule_id = p_schedule_id
  CROSS JOIN reg_count rc
  LEFT JOIN mark_entries me
         ON me.judge_id        = j.id
        AND me.schedule_id     = p_schedule_id
  GROUP BY j.id, j.name, rc.total_regs;
$$;

GRANT EXECUTE ON FUNCTION public.get_judge_submission_summary(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
