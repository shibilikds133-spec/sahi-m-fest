-- 1. Create the judge_tokens table
CREATE TABLE IF NOT EXISTS public.judge_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id UUID NOT NULL,
  schedule_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  created_by UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_used BOOLEAN DEFAULT false
);

-- 2. Enable RLS and add policies
ALTER TABLE public.judge_tokens ENABLE ROW LEVEL SECURITY;

-- If you have a custom way of setting tenant_id, use that, otherwise this is a basic policy
CREATE POLICY "Tenant isolation" ON public.judge_tokens
  USING (tenant_id = (current_setting('app.tenant_id', true))::UUID);

-- Drop existing policies if any to avoid errors when re-running
DROP POLICY IF EXISTS "Public can read tokens for validation" ON public.judge_tokens;
CREATE POLICY "Public can read tokens for validation"
ON public.judge_tokens FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage judge tokens" ON public.judge_tokens;
CREATE POLICY "Admins can manage judge tokens"
ON public.judge_tokens FOR ALL TO authenticated
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

-- 3. Create the RPC function
CREATE OR REPLACE FUNCTION public.generate_judge_token(
  p_judge_id UUID,
  p_schedule_id UUID,
  p_tenant_id UUID,
  p_created_by UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_existing_token TEXT;
BEGIN
  -- Check if a token already exists for this judge + schedule + tenant
  SELECT token INTO v_existing_token
  FROM public.judge_tokens
  WHERE judge_id = p_judge_id
    AND schedule_id = p_schedule_id
    AND tenant_id = p_tenant_id
  LIMIT 1;

  IF v_existing_token IS NOT NULL THEN
    RETURN v_existing_token;
  END IF;

  -- Generate a new unique token (6 characters)
  v_token := upper(encode(gen_random_bytes(3), 'hex')); -- 6-char hex token

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
