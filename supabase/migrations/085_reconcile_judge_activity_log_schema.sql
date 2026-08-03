-- Reconcile pre-existing judge_activity_logs tables that used older generic
-- audit column names. CREATE TABLE IF NOT EXISTS does not add missing columns.

BEGIN;

CREATE TABLE IF NOT EXISTS public.judge_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.judge_activity_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS judge_id uuid REFERENCES public.judges(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS token_id uuid REFERENCES public.judge_tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS action_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Backfill action_type from common legacy column names when they exist.
DO $backfill$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'judge_activity_logs'
      AND column_name = 'action'
  ) THEN
    EXECUTE $sql$
      UPDATE public.judge_activity_logs
      SET action_type = COALESCE(action_type, action)
      WHERE action_type IS NULL
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'judge_activity_logs'
      AND column_name = 'details'
  ) THEN
    EXECUTE $sql$
      UPDATE public.judge_activity_logs
      SET action_details = CASE
        WHEN action_details = '{}'::jsonb
          THEN COALESCE(to_jsonb(details), '{}'::jsonb)
        ELSE action_details
      END
      WHERE action_details = '{}'::jsonb
    $sql$;
  END IF;
END;
$backfill$;

UPDATE public.judge_activity_logs
SET action_type = 'UNKNOWN'
WHERE action_type IS NULL OR trim(action_type) = '';

ALTER TABLE public.judge_activity_logs
  ALTER COLUMN action_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judge_activity_logs_tenant_created
  ON public.judge_activity_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_judge_activity_logs_judge
  ON public.judge_activity_logs (judge_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_judge_activity_logs_schedule
  ON public.judge_activity_logs (schedule_id, created_at DESC);

ALTER TABLE public.judge_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can read judge activity logs"
  ON public.judge_activity_logs;
CREATE POLICY "Tenant admins can read judge activity logs"
ON public.judge_activity_logs FOR SELECT TO authenticated
USING (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
);

NOTIFY pgrst, 'reload schema';

COMMIT;
