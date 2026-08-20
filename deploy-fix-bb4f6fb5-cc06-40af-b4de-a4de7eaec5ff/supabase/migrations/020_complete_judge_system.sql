-- ============================================================
-- RUN THIS ENTIRE SCRIPT IN SUPABASE SQL EDITOR
-- All 3 blocks together in one query
-- ============================================================


-- BLOCK 1: judge_tokens table
CREATE TABLE IF NOT EXISTS judge_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  judge_id    uuid        REFERENCES judges(id)  ON DELETE CASCADE,
  schedule_id uuid        REFERENCES schedules(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,
  is_used     boolean     NOT NULL DEFAULT false,
  used_at     timestamptz,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);

ALTER TABLE judge_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read tokens for validation" ON judge_tokens;
CREATE POLICY "Public can read tokens for validation"
ON judge_tokens FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage judge tokens" ON judge_tokens;
CREATE POLICY "Admins can manage judge tokens"
ON judge_tokens FOR ALL TO authenticated
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE INDEX IF NOT EXISTS idx_judge_tokens_token
  ON judge_tokens (token) WHERE is_used = false;

CREATE INDEX IF NOT EXISTS idx_judge_tokens_schedule
  ON judge_tokens (schedule_id, tenant_id);


-- BLOCK 2: mark_entries RLS
ALTER TABLE mark_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage mark entries" ON mark_entries;
CREATE POLICY "Admins can manage mark entries"
ON mark_entries FOR ALL TO authenticated
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

DROP POLICY IF EXISTS "Public insert for judge tokens" ON mark_entries;
CREATE POLICY "Public insert for judge tokens"
ON mark_entries FOR INSERT
WITH CHECK (true);


-- BLOCK 3: results table RLS and unique constraint
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

ALTER TABLE results
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON results;
CREATE POLICY "Enable read access for all authenticated users"
ON results FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Enable all access for admins based on tenant_id" ON results;
CREATE POLICY "Enable all access for admins based on tenant_id"
ON results FOR ALL TO authenticated
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());
