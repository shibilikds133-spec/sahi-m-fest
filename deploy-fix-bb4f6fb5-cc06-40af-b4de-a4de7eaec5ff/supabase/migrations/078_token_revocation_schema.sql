-- PORTABLE SUPABASE MIGRATION 077 — TOKEN REVOCATION & SECURITY SCHEMA
-- Safe for both Fresh Supabase Projects and Existing Production Databases

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

-- 2. Backfill SHA-256 hashes for existing plaintext tokens (if any exist)
UPDATE public.judge_tokens
SET token_hash = encode(digest(upper(trim(token)), 'sha256'), 'hex')
WHERE token IS NOT NULL AND token_hash IS NULL;

-- 3. Conditional Production Data Repair: Dangling Token Revocation
-- Safely performs a NO-OP on a fresh Supabase project where no dangling tokens exist
DO $$
DECLARE
  v_dangling_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dangling_count
  FROM public.judge_tokens
  WHERE schedule_id IS NOT NULL AND schedule_id NOT IN (SELECT id FROM public.schedules);

  IF v_dangling_count > 0 THEN
    UPDATE public.judge_tokens
    SET original_schedule_id = schedule_id,
        schedule_id = NULL,
        is_revoked = true,
        revoked_at = NOW(),
        revocation_reason = 'Dangling token referencing deleted schedule'
    WHERE schedule_id IS NOT NULL AND schedule_id NOT IN (SELECT id FROM public.schedules);
  END IF;
END $$;

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
