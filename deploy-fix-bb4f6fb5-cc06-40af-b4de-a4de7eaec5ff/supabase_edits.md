# Supabase Database Edits Log

*This file contains all the manual SQL edits, functions, and fixes applied to the Supabase database. You can copy and paste these into a new Supabase project's SQL Editor to apply the exact same changes.*

---

## 1. Enable pgcrypto Extension
**Date:** July 27, 2026
**Reason:** Required for generating random access tokens (`gen_random_bytes`).

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## 2. Fix generate_judge_token RPC Function
**Date:** July 27, 2026
**Reason:** Fixed the `gen_random_bytes(integer) does not exist` error by correctly referencing the `extensions` schema.

```sql
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
```

---

## 3. Judge Login Approval Workflow
**Date:** July 27, 2026
**Reason:** Added status column for real-time admin approval workflow.

```sql
-- Add status column to judge_tokens for approval workflow
ALTER TABLE public.judge_tokens ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'created';

-- Update RLS for judges to be able to read and update their own token requests
DROP POLICY IF EXISTS "Judges can update their token status" ON public.judge_tokens;
CREATE POLICY "Judges can update their token status"
ON public.judge_tokens FOR UPDATE
USING (true)
WITH CHECK (true);

-- We also need to enable Realtime for judge_tokens table
ALTER PUBLICATION supabase_realtime ADD TABLE public.judge_tokens;
```
