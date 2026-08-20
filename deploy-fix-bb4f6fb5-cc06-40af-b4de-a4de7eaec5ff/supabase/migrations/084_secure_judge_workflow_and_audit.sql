-- Secure judge login approval, preserve judge activity history, and prevent
-- destructive deletion of judges that already have festival history.

BEGIN;

-- ---------------------------------------------------------------------------
-- Judge activity audit log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.judge_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  judge_id uuid REFERENCES public.judges(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  token_id uuid REFERENCES public.judge_tokens(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  action_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid,
  actor_type text NOT NULL DEFAULT 'judge'
    CHECK (actor_type IN ('judge', 'admin', 'system')),
  created_at timestamptz NOT NULL DEFAULT now()
);

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

-- Judge clients never insert directly. This RPC verifies either the signed-in
-- tenant admin or the active judge token before recording an event.
DROP FUNCTION IF EXISTS public.log_judge_activity(
  uuid, uuid, uuid, text, jsonb
);

CREATE OR REPLACE FUNCTION public.log_judge_activity(
  p_judge_id uuid,
  p_schedule_id uuid,
  p_tenant_id uuid,
  p_action_type text,
  p_action_details jsonb DEFAULT '{}'::jsonb,
  p_token text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_id uuid;
  v_is_admin boolean;
BEGIN
  v_is_admin :=
    auth.uid() IS NOT NULL
    AND (
      public.is_superadmin()
      OR p_tenant_id = public.get_my_tenant_id()
    );

  IF NOT v_is_admin THEN
    IF p_token IS NULL OR trim(p_token) = '' THEN
      RAISE EXCEPTION 'An active judge token is required.';
    END IF;

    SELECT jt.id
    INTO v_token_id
    FROM public.judge_tokens jt
    WHERE jt.judge_id = p_judge_id
      AND jt.schedule_id = p_schedule_id
      AND jt.tenant_id = p_tenant_id
      AND (
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
    LIMIT 1;

    IF v_token_id IS NULL THEN
      RAISE EXCEPTION 'Invalid or inactive judge token.';
    END IF;
  END IF;

  INSERT INTO public.judge_activity_logs (
    tenant_id,
    judge_id,
    schedule_id,
    token_id,
    action_type,
    action_details,
    actor_user_id,
    actor_type
  ) VALUES (
    p_tenant_id,
    p_judge_id,
    p_schedule_id,
    v_token_id,
    upper(trim(p_action_type)),
    COALESCE(p_action_details, '{}'::jsonb),
    auth.uid(),
    CASE WHEN v_is_admin THEN 'admin' ELSE 'judge' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_judge_activity(
  uuid, uuid, uuid, text, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_judge_activity(
  uuid, uuid, uuid, text, jsonb, text
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Secure token status transitions
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Judges can update their token status"
  ON public.judge_tokens;

CREATE OR REPLACE FUNCTION public.request_judge_login(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
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

  UPDATE public.judge_tokens
  SET status = CASE
    WHEN status = 'approved' THEN 'approved'
    ELSE 'pending_approval'
  END
  WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'id', v_token.id,
    'status', CASE
      WHEN v_token.status = 'approved' THEN 'approved'
      ELSE 'pending_approval'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_judge_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_judge_login(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_judge_login_status(p_token text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT CASE
    WHEN jt.is_used THEN 'used'
    WHEN jt.is_revoked IS TRUE THEN 'rejected'
    WHEN jt.expires_at IS NOT NULL AND jt.expires_at <= now() THEN 'expired'
    ELSE jt.status
  END
  INTO v_status
  FROM public.judge_tokens jt
  WHERE (
      jt.token_hash = encode(
        extensions.digest(upper(trim(p_token)), 'sha256'),
        'hex'
      )
      OR jt.token = upper(trim(p_token))
    )
  ORDER BY jt.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_status, 'invalid');
END;
$$;

REVOKE ALL ON FUNCTION public.get_judge_login_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_judge_login_status(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.expire_judge_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE public.judge_tokens jt
  SET is_used = true,
      used_at = now(),
      status = 'used'
  WHERE (
      jt.token_hash = encode(
        extensions.digest(upper(trim(p_token)), 'sha256'),
        'hex'
      )
      OR jt.token = upper(trim(p_token))
    )
    AND jt.is_used = false
    AND jt.is_revoked IS NOT TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or inactive judge token.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_judge_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_judge_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_judge_login(p_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
BEGIN
  SELECT jt.*
  INTO v_token
  FROM public.judge_tokens jt
  WHERE jt.id = p_token_id
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Login request not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_token.tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to approve this request.';
  END IF;

  IF v_token.status <> 'pending_approval'
    OR v_token.is_used
    OR v_token.is_revoked IS TRUE THEN
    RAISE EXCEPTION 'This login request is no longer pending.';
  END IF;

  UPDATE public.judge_tokens
  SET status = 'approved'
  WHERE id = p_token_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_judge_login(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_judge_login(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_judge_login(p_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token public.judge_tokens%ROWTYPE;
BEGIN
  SELECT jt.*
  INTO v_token
  FROM public.judge_tokens jt
  WHERE jt.id = p_token_id
  FOR UPDATE;

  IF v_token.id IS NULL THEN
    RAISE EXCEPTION 'Login request not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_token.tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to reject this request.';
  END IF;

  IF v_token.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'This login request is no longer pending.';
  END IF;

  UPDATE public.judge_tokens
  SET status = 'rejected',
      is_revoked = true,
      revoked_at = now(),
      revoked_by = auth.uid(),
      revocation_reason = 'Login request rejected by administrator'
  WHERE id = p_token_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_judge_login(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_judge_login(uuid) TO authenticated;

-- Canonical token validation additionally enforces approval status and active
-- event assignment. Rejected codes can never be copied back into a session.
CREATE OR REPLACE FUNCTION public.validate_judge_token(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token_hash text;
  v_result json;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN NULL;
  END IF;

  v_token_hash := encode(
    extensions.digest(upper(trim(p_token)), 'sha256'),
    'hex'
  );

  SELECT json_build_object(
    'id', jt.id,
    'token', jt.token,
    'status', jt.status,
    'is_used', jt.is_used,
    'judge_id', jt.judge_id,
    'schedule_id', jt.schedule_id,
    'tenant_id', jt.tenant_id,
    'judges', json_build_object('name', j.name),
    'schedules', json_build_object(
      'id', s.id,
      'start_time', s.start_time,
      'items', json_build_object(
        'item_name_ml', i.item_name_ml,
        'item_name_en', i.item_name_en
      ),
      'venues', json_build_object('name', v.name)
    )
  )
  INTO v_result
  FROM public.judge_tokens jt
  JOIN public.schedule_judge_assignments a
    ON a.schedule_id = jt.schedule_id
   AND a.judge_id = jt.judge_id
   AND a.tenant_id = jt.tenant_id
   AND a.status = 'active'
  LEFT JOIN public.judges j ON j.id = jt.judge_id
  LEFT JOIN public.schedules s ON s.id = jt.schedule_id
  LEFT JOIN public.items i ON i.id = s.item_id
  LEFT JOIN public.venues v ON v.id = s.venue_id
  WHERE (jt.token_hash = v_token_hash OR jt.token = upper(trim(p_token)))
    AND jt.is_used = false
    AND jt.is_revoked IS NOT TRUE
    AND jt.status IS DISTINCT FROM 'rejected'
    AND (jt.expires_at IS NULL OR jt.expires_at > now())
  ORDER BY jt.created_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_judge_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_judge_token(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Server-side audit triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_judge_token_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CODE_GENERATED';
  ELSIF NEW.is_revoked IS TRUE
    AND OLD.is_revoked IS NOT TRUE
    AND NEW.revocation_reason = 'Regenerated by administrator' THEN
    v_action := 'CODE_REGENERATED';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'pending_approval' THEN 'LOGIN_REQUESTED'
      WHEN 'approved' THEN 'LOGIN_APPROVED'
      WHEN 'rejected' THEN 'LOGIN_REJECTED'
      WHEN 'used' THEN 'CODE_USED'
      ELSE NULL
    END;
  END IF;

  IF v_action IS NOT NULL THEN
    INSERT INTO public.judge_activity_logs (
      tenant_id,
      judge_id,
      schedule_id,
      token_id,
      action_type,
      action_details,
      actor_user_id,
      actor_type
    ) VALUES (
      NEW.tenant_id,
      NEW.judge_id,
      NEW.schedule_id,
      NEW.id,
      v_action,
      jsonb_build_object('status', NEW.status),
      auth.uid(),
      CASE WHEN auth.uid() IS NULL THEN 'judge' ELSE 'admin' END
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_judge_token_change
  ON public.judge_tokens;
CREATE TRIGGER trg_audit_judge_token_change
AFTER INSERT OR UPDATE ON public.judge_tokens
FOR EACH ROW
EXECUTE FUNCTION public.audit_judge_token_change();

REVOKE ALL ON FUNCTION public.audit_judge_token_change() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.audit_schedule_judge_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    v_action := 'JUDGE_ASSIGNED';
  ELSIF TG_OP = 'UPDATE'
    AND NEW.status IS DISTINCT FROM OLD.status THEN
    v_action := CASE NEW.status
      WHEN 'active' THEN 'JUDGE_ASSIGNED'
      WHEN 'removed' THEN 'JUDGE_REMOVED'
      ELSE NULL
    END;
  END IF;

  IF v_action IS NOT NULL THEN
    INSERT INTO public.judge_activity_logs (
      tenant_id,
      judge_id,
      schedule_id,
      action_type,
      action_details,
      actor_user_id,
      actor_type
    ) VALUES (
      NEW.tenant_id,
      NEW.judge_id,
      NEW.schedule_id,
      v_action,
      jsonb_build_object('reason', NEW.removal_reason),
      auth.uid(),
      'admin'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_schedule_judge_assignment
  ON public.schedule_judge_assignments;
CREATE TRIGGER trg_audit_schedule_judge_assignment
AFTER INSERT OR UPDATE ON public.schedule_judge_assignments
FOR EACH ROW
EXECUTE FUNCTION public.audit_schedule_judge_assignment();

REVOKE ALL ON FUNCTION public.audit_schedule_judge_assignment() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Safe judge deletion
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_judge_safely(p_judge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT j.tenant_id
  INTO v_tenant_id
  FROM public.judges j
  WHERE j.id = p_judge_id
  FOR UPDATE;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Judge not found.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to delete this judge.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.schedule_judge_assignments a
    WHERE a.judge_id = p_judge_id
  ) THEN
    RAISE EXCEPTION
      'This judge has event assignment history and cannot be deleted. Remove the judge from active panels instead.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.mark_entries me WHERE me.judge_id = p_judge_id
  ) OR EXISTS (
    SELECT 1 FROM public.judge_tokens jt WHERE jt.judge_id = p_judge_id
  ) OR EXISTS (
    SELECT 1 FROM public.judge_activity_logs al WHERE al.judge_id = p_judge_id
  ) THEN
    RAISE EXCEPTION
      'This judge has access-code, marks, or audit history and cannot be deleted.';
  END IF;

  DELETE FROM public.judges
  WHERE id = p_judge_id
    AND tenant_id = v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_judge_safely(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_judge_safely(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
