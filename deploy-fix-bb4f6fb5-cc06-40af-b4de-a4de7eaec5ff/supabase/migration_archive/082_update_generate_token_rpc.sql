-- ARCHIVED DUPLICATE MIGRATION
--
-- This file originally existed as supabase/migrations/082_update_generate_token_rpc.sql
-- and collided with 082_judge_token_regeneration.sql. It is retained byte-for-byte
-- below as an audit artifact, but is not executable migration history. Migration
-- 083 is the canonical live implementation and migration 094 records the forward
-- reconciliation.

-- Update generate_judge_token to accept p_force_refresh parameter

DROP FUNCTION IF EXISTS public.generate_judge_token(UUID, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.generate_judge_token(
  p_judge_id UUID,
  p_schedule_id UUID,
  p_tenant_id UUID,
  p_created_by UUID,
  p_force_refresh BOOLEAN DEFAULT false
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_existing_token TEXT;
BEGIN
  IF NOT p_force_refresh THEN
    -- Check if a token already exists for this judge + schedule + tenant
    SELECT token INTO v_existing_token
    FROM public.judge_tokens
    WHERE judge_id = p_judge_id
      AND schedule_id = p_schedule_id
      AND tenant_id = p_tenant_id
      AND is_used = false
    LIMIT 1;

    IF v_existing_token IS NOT NULL THEN
      RETURN v_existing_token;
    END IF;
  ELSE
    -- If force refresh, mark existing unused tokens as used/expired
    UPDATE public.judge_tokens
    SET is_used = true, used_at = now()
    WHERE judge_id = p_judge_id
      AND schedule_id = p_schedule_id
      AND tenant_id = p_tenant_id
      AND is_used = false;
  END IF;

  -- Generate a new unique token (6 characters)
  v_token := upper(encode(extensions.gen_random_bytes(3), 'hex')); -- 6-char hex token

  INSERT INTO public.judge_tokens (
    judge_id,
    schedule_id,
    tenant_id,
    created_by,
    token,
    created_at
  ) VALUES (
    p_judge_id,
    p_schedule_id,
    p_tenant_id,
    p_created_by,
    v_token,
    now()
  );

  RETURN v_token;
END;
$$;
