--------------------------------------------------------------------------------
-- 105. SCOPE PREFLIGHT USERNAME VALIDATION TO CHILD ORGANISATIONS ONLY
--
-- BUG: begin_provisioning_operation (migration 100) validated p_username with
-- the username regex ^[a-z0-9_]{3,40}$ UNCONDITIONALLY. For root_tenant the
-- Edge Function passes the ADMIN EMAIL in the p_username slot (the preflight
-- INSERT stores it in tenant_provisioning_operations.admin_email), so any
-- valid email (contains '@' / '.') failed the regex and the root onboarding
-- preflight was denied with:
--     {"error":"PREFLIGHT_DENIED","message":"Invalid username format"}
-- for BOTH Sahithyolsav and College Fest root onboarding.
--
-- FIX: apply the username format check ONLY when p_operation_type is
-- 'child_organisation', and (defense in depth, mirroring the Edge Function's
-- own rule) reject a child operation that carries NO username.
--
-- Preserved exactly: authentication requirement, root_tenant superadmin-only
-- authorization, child hierarchy visibility checks, archived-parent check,
-- idempotency lock (FOR UPDATE) and per-operation ownership enforcement,
-- INSERT mapping (admin_email column receives p_username for root_tenant).
-- The child username contract ^[a-z0-9_]{3,40}$ is NOT weakened.
--
-- Migration 102 is NOT modified.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.begin_provisioning_operation(
  p_operation_type text,
  p_idempotency_key text,
  p_parent_id uuid DEFAULT NULL,
  p_org_name text DEFAULT NULL,
  p_username text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_op public.tenant_provisioning_operations;
  v_parent_archived_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Authorization
  IF p_operation_type = 'child_organisation' THEN
    IF NOT public.is_superadmin() THEN
      IF public.get_my_tenant_id() IS NULL THEN
        RAISE EXCEPTION 'Permission denied: tenant access required or disabled';
      END IF;
      IF p_parent_id IS NULL OR NOT public.is_org_visible(p_parent_id) THEN
        RAISE EXCEPTION 'Permission denied: parent organisation is not within your hierarchy';
      END IF;
    END IF;

    -- Archived parent check
    SELECT archived_at INTO v_parent_archived_at
    FROM public.organisations WHERE id = p_parent_id;

    IF v_parent_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Permission denied: parent organisation is archived';
    END IF;
  ELSIF p_operation_type = 'root_tenant' THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'Permission denied: only superadmin can provision root tenant';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid operation type';
  END IF;

  -- 2. Lookup/Lock existing operation OR Insert new one
  SELECT * INTO v_op
  FROM public.tenant_provisioning_operations
  WHERE operation_type = p_operation_type AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    -- Enforce ownership on existing operation
    IF v_op.requested_by <> v_uid AND NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'Permission denied: operation belongs to another user';
    END IF;
    RETURN v_op.id;
  END IF;

  -- Ensure username format -- child_organisation ONLY. For root_tenant the
  -- p_username parameter carries the admin_email (stored in the admin_email
  -- column below) and must NOT be validated as a username.
  IF p_operation_type = 'child_organisation' AND
     (p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,40}$') THEN
    RAISE EXCEPTION 'Invalid username format';
  END IF;

  -- If not found, create it as pending
  INSERT INTO public.tenant_provisioning_operations (
    operation_type, idempotency_key, requested_by, admin_email, status
  ) VALUES (
    p_operation_type, p_idempotency_key, v_uid, p_username, 'pending'
  ) RETURNING id INTO v_op.id;

  RETURN v_op.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.begin_provisioning_operation TO authenticated;
