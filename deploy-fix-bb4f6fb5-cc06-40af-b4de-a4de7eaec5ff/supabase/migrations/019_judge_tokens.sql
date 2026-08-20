-- Migration 019: Judge Tokens - Single Use Access Code System
-- Admin generates a 6-char token for a judge + schedule combo.
-- Judge uses code to enter marks. Code expires after submission.

CREATE TABLE IF NOT EXISTS judge_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  judge_id     uuid        REFERENCES judges(id)  ON DELETE CASCADE,
  schedule_id  uuid        REFERENCES schedules(id) ON DELETE CASCADE,
  token        text        NOT NULL UNIQUE,
  is_used      boolean     NOT NULL DEFAULT false,
  used_at      timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz
);

ALTER TABLE judge_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read tokens for validation" ON judge_tokens;
CREATE POLICY "Public can read tokens for validation"
ON judge_tokens FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage judge tokens" ON judge_tokens;
CREATE POLICY "Admins can manage judge tokens"
ON judge_tokens FOR ALL TO authenticated
USING (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
)
WITH CHECK (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
);

CREATE INDEX IF NOT EXISTS idx_judge_tokens_token
  ON judge_tokens (token)
  WHERE is_used = false;

CREATE INDEX IF NOT EXISTS idx_judge_tokens_schedule
  ON judge_tokens (schedule_id, tenant_id);
