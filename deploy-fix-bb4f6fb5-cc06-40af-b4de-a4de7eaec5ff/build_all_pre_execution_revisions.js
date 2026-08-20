const fs = require('fs');
const path = require('path');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';
const stagingMigrationsDir = path.join(artDir, 'staging_migrations');

// Read evidence data
const data = JSON.parse(fs.readFileSync('final_render_data.json', 'utf8'));
const scheds = data.scheds;
const items = data.items;
const itemMap = new Map(items.map(i => [i.id, i]));

const reviewed35Scheds = scheds.filter(s => {
  const item = itemMap.get(s.item_id);
  return item && s.festival_id !== item.festival_id;
}).map(s => {
  const item = itemMap.get(s.item_id);
  return {
    schedule_id: s.id,
    item_id: s.item_id,
    item_festival_id: item.festival_id,
    schedule_tenant_id: s.tenant_id,
    item_tenant_id: item.tenant_id,
    original_schedule_festival_id: s.festival_id
  };
});

// ==============================================================================
// 1. REVISED STAGING_MIGRATIONS/077_TOKEN_REVOCATION_SCHEMA.SQL
// ==============================================================================
const m77Revised = `-- STAGING ONLY — NOT APPROVED FOR PRODUCTION
-- Target Environment: Disposable / Cloned Staging Supabase Database ONLY

BEGIN;

-- 1. Add token security columns to judge_tokens table
ALTER TABLE public.judge_tokens
ADD COLUMN IF NOT EXISTS token_hash TEXT,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revoked_by UUID,
ADD COLUMN IF NOT EXISTS revocation_reason TEXT,
ADD COLUMN IF NOT EXISTS original_schedule_id UUID;

-- 2. Backfill SHA-256 hashes for existing plaintext tokens
UPDATE public.judge_tokens
SET token_hash = encode(digest(upper(trim(token)), 'sha256'), 'hex')
WHERE token IS NOT NULL AND token_hash IS NULL;

-- 3. Update the 4 dangling tokens referencing deleted schedule UUIDs
-- Preserves original schedule UUID in original_schedule_id, sets operational schedule_id = NULL
UPDATE public.judge_tokens
SET original_schedule_id = schedule_id,
    schedule_id = NULL,
    is_revoked = true,
    revoked_at = NOW(),
    revocation_reason = 'STAGING_TEST: Dangling token referencing deleted schedule'
WHERE schedule_id IS NOT NULL AND schedule_id NOT IN (SELECT id FROM public.schedules);

-- 4. Create safe hash lookup index
CREATE INDEX IF NOT EXISTS idx_judge_tokens_hash
  ON public.judge_tokens (token_hash)
  WHERE is_revoked IS NOT TRUE;

-- 5. Restrict public direct table read access on judge_tokens
DROP POLICY IF EXISTS "Public can read tokens for validation" ON public.judge_tokens;

-- 6. Update validate_judge_token RPC with search_path and revocation/expiration enforcement
CREATE OR REPLACE FUNCTION public.validate_judge_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_hash TEXT;
  v_result JSON;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  v_token_hash := encode(digest(upper(trim(p_token)), 'sha256'), 'hex');

  SELECT json_build_object(
    'id',          jt.id,
    'token',       jt.token,
    'is_used',     jt.is_used,
    'judge_id',    jt.judge_id,
    'schedule_id', jt.schedule_id,
    'tenant_id',   jt.tenant_id,
    'judges',      json_build_object('name', j.name),
    'schedules',   json_build_object(
      'id',         s.id,
      'start_time', s.start_time,
      'items',      json_build_object(
        'item_name_ml', i.item_name_ml,
        'item_name_en', i.item_name_en
      ),
      'venues',     json_build_object('name', v.name)
    )
  )
  INTO v_result
  FROM public.judge_tokens jt
  LEFT JOIN public.judges    j  ON j.id = jt.judge_id
  LEFT JOIN public.schedules s  ON s.id = jt.schedule_id
  LEFT JOIN public.items     i  ON i.id = s.item_id
  LEFT JOIN public.venues    v  ON v.id = s.venue_id
  WHERE (jt.token_hash = v_token_hash OR jt.token = upper(trim(p_token)))
    AND jt.is_used = false
    AND (jt.is_revoked IS NOT TRUE)
    AND (jt.expires_at IS NULL OR jt.expires_at > NOW())
  LIMIT 1;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_judge_token(TEXT) TO anon, authenticated;

COMMIT;
`;

fs.writeFileSync(path.join(stagingMigrationsDir, '077_token_revocation_schema.sql'), m77Revised);

// ==============================================================================
// 2. REVISED STAGING_MIGRATIONS/078_SCHEDULE_FESTIVAL_RECONCILIATION.SQL
// ==============================================================================
const reviewedUuidListSql = reviewed35Scheds.map(s => `'${s.schedule_id}'::uuid`).join(',\n    ');

const m78Revised = `-- STAGING ONLY — NOT APPROVED FOR PRODUCTION
-- Target Environment: Disposable / Cloned Staging Supabase Database ONLY

BEGIN;

-- 1. Create temporary staging snapshot table for rollback verification
CREATE TEMP TABLE staging_schedule_festival_snapshot AS
SELECT id AS schedule_id, festival_id AS original_festival_id, tenant_id, item_id, NOW() AS snapshot_at
FROM public.schedules
WHERE id IN (
    ${reviewedUuidListSql}
);

-- 2. Strict Precondition Check: Abort unless exactly the 35 reviewed schedule IDs are present
DO $$
DECLARE
  v_matching_count INTEGER;
  v_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_matching_count
  FROM public.schedules s
  JOIN public.items i ON s.item_id = i.id
  WHERE s.id IN (
    ${reviewedUuidListSql}
  )
  AND s.tenant_id = i.tenant_id
  AND i.festival_id IS NOT NULL;

  IF v_matching_count <> 35 THEN
    RAISE EXCEPTION 'Precondition Failed: Expected exactly 35 matching reviewed schedule IDs, found %', v_matching_count;
  END IF;

  SELECT COUNT(*) INTO v_null_count
  FROM public.schedules
  WHERE id IN (
    ${reviewedUuidListSql}
  ) AND festival_id IS NOT NULL;

  IF v_null_count <> 0 THEN
    RAISE EXCEPTION 'Precondition Failed: Expected all 35 reviewed schedule festival_ids to be NULL, found % non-NULL', v_null_count;
  END IF;
END $$;

-- 3. Execute Reconciliation Update on the exact 35 reviewed schedules
UPDATE public.schedules s
SET festival_id = i.festival_id
FROM public.items i
WHERE s.item_id = i.id
  AND s.id IN (
    ${reviewedUuidListSql}
  )
  AND s.festival_id IS NULL
  AND i.festival_id IS NOT NULL
  AND s.tenant_id = i.tenant_id;

-- 4. Post-Update Assertion: Verify exactly 35 schedules changed
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_updated_count
  FROM public.schedules
  WHERE id IN (
    ${reviewedUuidListSql}
  ) AND festival_id IS NOT NULL;

  IF v_updated_count <> 35 THEN
    RAISE EXCEPTION 'Postcondition Failed: Expected 35 updated schedules, found %', v_updated_count;
  END IF;
END $$;

COMMIT;
`;

fs.writeFileSync(path.join(stagingMigrationsDir, '078_schedule_festival_reconciliation.sql'), m78Revised);

// ==============================================================================
// 3. REVISED STAGING_MIGRATIONS/079_COMPOSITE_BOUNDARY_CONSTRAINTS.SQL
// ==============================================================================
const m79Revised = `-- STAGING ONLY — NOT APPROVED FOR PRODUCTION
-- Target Environment: Disposable / Cloned Staging Supabase Database ONLY

BEGIN;

-- 1. Add composite unique keys to enforce boundary integrity in staging for sector entities
-- COMPATIBLE WITH HYBRID TENANT MODEL: Enforces composite key scope on sector schedules and items
ALTER TABLE public.schedules
ADD CONSTRAINT uq_schedules_boundary UNIQUE (id, tenant_id, festival_id);

ALTER TABLE public.items
ADD CONSTRAINT uq_items_boundary UNIQUE (id, tenant_id, festival_id);

ALTER TABLE public.registrations
ADD CONSTRAINT uq_registrations_boundary UNIQUE (id, tenant_id, festival_id);

-- NOTE ON HYBRID TENANT OWNERSHIP (GATE-07):
-- Incompatible multi-column tenant foreign keys on registrations are omitted.
-- Under the accepted hybrid tenant model:
--   - participant tenant = unit
--   - registration tenant = sector festival owner
-- Single-column FK registrations.participant_id -> participants.id is retained.

COMMIT;
`;

fs.writeFileSync(path.join(stagingMigrationsDir, '079_composite_boundary_constraints.sql'), m79Revised);
console.log('Saved revised SQL files.');
