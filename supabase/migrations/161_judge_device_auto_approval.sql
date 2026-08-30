-- Migration 124: Judge Device Auto Approval

-- Add device columns to judge_tokens
ALTER TABLE public.judge_tokens
ADD COLUMN IF NOT EXISTS device_id text,
ADD COLUMN IF NOT EXISTS device_info text;

-- Drop the old function to recreate it with new signature
DROP FUNCTION IF EXISTS public.request_judge_login(text);

CREATE OR REPLACE FUNCTION public.request_judge_login(
  p_token text,
  p_device_id text DEFAULT NULL,
  p_device_info text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
  v_auto_approve boolean := false;
  v_new_status text := 'pending_approval';
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'Access code is required.';
  END IF;

  SELECT jt.*
  INTO v_token
  FROM public.judge_tokens jt
  WHERE (
      jt.token_hash = encode(
        extensions.digest(upper(trim(p_token)), 'sha256'),
        'hex'
      )
      OR jt.token = upper(trim(p_token))
    )
    AND jt.is_used = false
    AND jt.is_revoked IS NOT TRUE
    AND jt.status IS DISTINCT FROM 'rejected'
    AND (jt.expires_at IS NULL OR jt.expires_at > now())
  ORDER BY jt.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Invalid, expired, or rejected access code.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.schedule_id = v_token.schedule_id
      AND a.judge_id = v_token.judge_id
      AND a.tenant_id = v_token.tenant_id
      AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'This judge is no longer assigned to the event.';
  END IF;

  -- Check for auto-approval if device_id is provided
  IF p_device_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.judge_tokens
      WHERE judge_id = v_token.judge_id
        AND device_id = p_device_id
        AND (status = 'approved' OR is_used = true)
        AND id <> v_token.id
    ) INTO v_auto_approve;
  END IF;

  IF v_auto_approve THEN
    v_new_status := 'approved';
  ELSIF v_token.status = 'approved' THEN
    v_new_status := 'approved';
  END IF;

  UPDATE public.judge_tokens
  SET status = v_new_status,
      device_id = COALESCE(p_device_id, device_id),
      device_info = COALESCE(p_device_info, device_info)
  WHERE id = v_token.id;

  -- Log the auto-approval if it just happened
  IF v_auto_approve AND v_token.status <> 'approved' THEN
    INSERT INTO public.judge_activity_logs (
      tenant_id,
      judge_id,
      schedule_id,
      token_id,
      action_type,
      action_details,
      performed_by
    ) VALUES (
      v_token.tenant_id,
      v_token.judge_id,
      v_token.schedule_id,
      v_token.id,
      'auto_approved_by_device',
      jsonb_build_object('device_id', p_device_id, 'device_info', p_device_info),
      v_token.judge_id
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_token.id,
    'status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_judge_login(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_judge_login(text, text, text) TO anon, authenticated;
