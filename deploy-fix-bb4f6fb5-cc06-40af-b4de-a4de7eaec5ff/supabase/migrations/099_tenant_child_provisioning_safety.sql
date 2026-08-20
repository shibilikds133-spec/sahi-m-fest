-- 099_tenant_child_provisioning_safety.sql
-- C2: Repair tenant-admin and child-organisation onboarding.
--
-- Confirmed problems addressed here (verified against the repository):
--   1. Root tenant flow: frontend sent 6 keys (incl. p_admin_email, p_admin_pass)
--      to a 4-parameter function (setup_tenant_records) -> PostgREST mismatch ->
--      database linking failed -> orphan Auth user with a client-chosen password.
--   2. Child flow: frontend sent 7 keys (incl. p_internal_email) to a 6-parameter
--      function (setup_child_organisation) -> mismatch -> orphan Auth user.
--   3. Plaintext temporary passwords were accepted and persisted in
--      organisations.admin_password_temp (and returned to clients).
--   4. setup_tenant_records had NO caller authorization and default PUBLIC
--      execute; setup_child_organisation had a NULL-semantics hole (disabled /
--      tenant-less callers could pass the gate) and both stored plaintext.
--   5. Profile trigger created every new Auth user with role 'admin' by default.
--   6. Profile RLS let any user UPDATE their own role/tenant_id (escalation).
--
-- Forward-only. NOT to be applied to Supabase until reviewed.

BEGIN;

--------------------------------------------------------------------------------
-- 1. PROVISIONING OPERATION RECORD (idempotency + compensation tracking)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_provisioning_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL
    CHECK (operation_type IN ('root_tenant', 'child_organisation')),
  idempotency_key text NOT NULL,
  requested_by uuid,
  target_organisation_id uuid,
  target_tenant_id uuid,
  target_user_id uuid,
  admin_email text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'auth_user_created',
                      'database_linked', 'completed', 'failed',
                      'compensation_pending', 'compensated')),
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (operation_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_provisioning_ops_requested_by
  ON public.tenant_provisioning_operations (requested_by);
CREATE INDEX IF NOT EXISTS idx_provisioning_ops_status
  ON public.tenant_provisioning_operations (status);

ALTER TABLE public.tenant_provisioning_operations ENABLE ROW LEVEL SECURITY;

-- Read: the requesting user sees their own operations; superadmin sees all.
-- No INSERT/UPDATE/DELETE policies: writes happen exclusively inside
-- SECURITY DEFINER functions and the server-side provisioning endpoint.
DROP POLICY IF EXISTS "Provisioning ops visible to requester or superadmin"
  ON public.tenant_provisioning_operations;
CREATE POLICY "Provisioning ops visible to requester or superadmin"
  ON public.tenant_provisioning_operations FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_superadmin());

-- The table never stores passwords, tokens, keys or raw error text.

--------------------------------------------------------------------------------
-- 2. PROFILE TRIGGER: least-privilege default role
--------------------------------------------------------------------------------
-- Every new Auth user previously received role 'admin' automatically. New
-- signups now default to 'participant'; privileged roles are assigned ONLY by
-- the provisioning finalisation RPCs below. is_superadmin stays false.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, is_superadmin)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'participant', false);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- 3. PROFILE RLS: close self-escalation
--------------------------------------------------------------------------------
-- Old policies let any user INSERT their own profile with any role/tenant and
-- UPDATE their own role/tenant_id/is_superadmin. They are replaced by a single
-- UPDATE policy that only allows non-privileged column changes (full_name,
-- phone, notification_enabled, etc.). Privileged assignment happens only in
-- SECURITY DEFINER finalisation RPCs. INSERT of own profile is not used by any
-- client flow (verified) and is removed.
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

CREATE POLICY "Users can update own non-privileged profile fields"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role IS NOT DISTINCT FROM (
      SELECT role FROM public.profiles WHERE id = auth.uid()
    )
    AND tenant_id IS NOT DISTINCT FROM (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
    AND is_superadmin IS NOT DISTINCT FROM (
      SELECT is_superadmin FROM public.profiles WHERE id = auth.uid()
    )
  );

--------------------------------------------------------------------------------
-- 4. INTERNAL PROVISIONING HELPERS
--------------------------------------------------------------------------------

-- Shared: resolve the target organisation for provisioning.
CREATE OR REPLACE FUNCTION public._provisioning_get_org(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org jsonb;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation is required';
  END IF;
  SELECT jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'org_type', o.org_type,
    'tenant_id', o.tenant_id,
    'archived_at', o.archived_at,
    'parent_id', o.parent_id
  ) INTO v_org
  FROM public.organisations o
  WHERE o.id = p_org_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organisation not found';
  END IF;
  RETURN v_org;
END;
$$;

-- Shared: idempotent safe profile assignment. A profile is only assigned to a
-- tenant when it currently has NO tenant (never moved across tenants). The
-- target must be an existing Auth user and must not be the superadmin.
CREATE OR REPLACE FUNCTION public._provisioning_link_profile(
  p_user_id uuid,
  p_tenant_id uuid,
  p_full_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_tenant uuid;
  v_is_superadmin boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Target auth user does not exist';
  END IF;

  SELECT tenant_id, COALESCE(is_superadmin, false)
    INTO v_existing_tenant, v_is_superadmin
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_is_superadmin THEN
    RAISE EXCEPTION 'Provisioning a superadmin account is not allowed';
  END IF;

  IF v_existing_tenant IS NOT NULL AND v_existing_tenant <> p_tenant_id THEN
    RAISE EXCEPTION 'Target user already belongs to another tenant';
  END IF;

  INSERT INTO public.profiles (id, full_name, role, tenant_id, is_superadmin)
  VALUES (p_user_id, p_full_name, 'admin', p_tenant_id, false)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = 'admin',
        tenant_id = EXCLUDED.tenant_id
    WHERE public.profiles.tenant_id IS NULL;
END;
$$;

-- Shared: idempotency record fetch.
CREATE OR REPLACE FUNCTION public._provisioning_get_op(
  p_operation_type text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op jsonb;
BEGIN
  IF p_idempotency_key IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT jsonb_build_object(
    'id', o.id,
    'status', o.status,
    'target_tenant_id', o.target_tenant_id,
    'target_organisation_id', o.target_organisation_id,
    'target_user_id', o.target_user_id,
    'admin_email', o.admin_email
  ) INTO v_op
  FROM public.tenant_provisioning_operations o
  WHERE o.operation_type = p_operation_type
    AND o.idempotency_key = p_idempotency_key;
  RETURN v_op;
END;
$$;

-- Shared: upsert a provisioning operation record (called only from SECURITY
-- DEFINER contexts; the provisioning endpoint also uses the RPC below).
CREATE OR REPLACE FUNCTION public._provisioning_upsert_op(
  p_operation_type text,
  p_idempotency_key text,
  p_status text,
  p_requested_by uuid DEFAULT NULL,
  p_target_organisation_id uuid DEFAULT NULL,
  p_target_tenant_id uuid DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_admin_email text DEFAULT NULL,
  p_failure_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op_id uuid;
BEGIN
  INSERT INTO public.tenant_provisioning_operations (
    operation_type, idempotency_key, status, requested_by,
    target_organisation_id, target_tenant_id, target_user_id,
    admin_email, failure_code, completed_at
  ) VALUES (
    p_operation_type, p_idempotency_key, p_status,
    COALESCE(p_requested_by, auth.uid()),
    p_target_organisation_id, p_target_tenant_id, p_target_user_id,
    p_admin_email, p_failure_code,
    CASE WHEN p_status = 'completed' THEN now() ELSE NULL END
  )
  ON CONFLICT (operation_type, idempotency_key) DO UPDATE
    SET status = EXCLUDED.status,
        requested_by = COALESCE(public.tenant_provisioning_operations.requested_by, EXCLUDED.requested_by),
        target_organisation_id = COALESCE(EXCLUDED.target_organisation_id, public.tenant_provisioning_operations.target_organisation_id),
        target_tenant_id = COALESCE(EXCLUDED.target_tenant_id, public.tenant_provisioning_operations.target_tenant_id),
        target_user_id = COALESCE(EXCLUDED.target_user_id, public.tenant_provisioning_operations.target_user_id),
        admin_email = COALESCE(EXCLUDED.admin_email, public.tenant_provisioning_operations.admin_email),
        failure_code = EXCLUDED.failure_code,
        completed_at = CASE WHEN EXCLUDED.status = 'completed' THEN now() ELSE public.tenant_provisioning_operations.completed_at END,
        updated_at = now()
  RETURNING id INTO v_op_id;

  IF v_op_id IS NULL THEN
    SELECT id INTO v_op_id
    FROM public.tenant_provisioning_operations
    WHERE operation_type = p_operation_type
      AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_op_id;
END;
$$;

-- Event recorder used by the server-side provisioning endpoint (service role)
-- for auth-side lifecycle events: auth_user_created, compensation_pending,
-- compensated, failed. Revoked from all client roles below.
CREATE OR REPLACE FUNCTION public.record_provisioning_event(
  p_operation_type text,
  p_idempotency_key text,
  p_status text,
  p_requested_by uuid DEFAULT NULL,
  p_target_organisation_id uuid DEFAULT NULL,
  p_target_tenant_id uuid DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_admin_email text DEFAULT NULL,
  p_failure_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op_id uuid;
BEGIN
  IF p_operation_type NOT IN ('root_tenant', 'child_organisation') THEN
    RAISE EXCEPTION 'Invalid operation type';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  IF p_status NOT IN ('pending', 'validated', 'auth_user_created',
                      'database_linked', 'completed', 'failed',
                      'compensation_pending', 'compensated') THEN
    RAISE EXCEPTION 'Invalid provisioning status';
  END IF;

  v_op_id := public._provisioning_upsert_op(
    p_operation_type, p_idempotency_key, p_status,
    p_requested_by, p_target_organisation_id, p_target_tenant_id,
    p_target_user_id, p_admin_email, p_failure_code
  );

  RETURN jsonb_build_object('success', true, 'operation_id', v_op_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_provisioning_event(text, text, text, uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_provisioning_event(text, text, text, uuid, uuid, uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_provisioning_event(text, text, text, uuid, uuid, uuid, uuid, text, text) FROM authenticated;

-- Internal helpers: no client execute grant.
REVOKE ALL ON FUNCTION public._provisioning_get_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._provisioning_get_org(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._provisioning_get_org(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public._provisioning_link_profile(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._provisioning_link_profile(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public._provisioning_link_profile(uuid, uuid, text) FROM authenticated;
REVOKE ALL ON FUNCTION public._provisioning_get_op(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._provisioning_get_op(text, text) FROM anon;
REVOKE ALL ON FUNCTION public._provisioning_get_op(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public._provisioning_upsert_op(text, text, text, uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._provisioning_upsert_op(text, text, text, uuid, uuid, uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public._provisioning_upsert_op(text, text, text, uuid, uuid, uuid, uuid, text, text) FROM authenticated;

--------------------------------------------------------------------------------
-- 5. ROOT TENANT FINALISATION
--------------------------------------------------------------------------------
-- Called by the trusted provisioning endpoint with the ACTING ADMIN's JWT
-- (auth.uid() = actor). Superadmin only. Never accepts a password.
CREATE OR REPLACE FUNCTION public.finalise_tenant_provisioning(
  p_org_id uuid,
  p_user_id uuid,
  p_org_name text,
  p_org_type text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_org jsonb;
  v_tenant_id uuid;
  v_org_tenant uuid;
  v_op jsonb;
  v_op_id uuid;
  v_created_tenant boolean := false;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Actor must be superadmin. The client never supplies the role.
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Permission denied: superadmin access required';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;

  IF p_org_type IS NULL OR p_org_type NOT IN ('unit', 'sector', 'division', 'district', 'state') THEN
    RAISE EXCEPTION 'Invalid organisation type';
  END IF;

  IF p_org_name IS NULL OR length(p_org_name) < 2 OR length(p_org_name) > 120 THEN
    RAISE EXCEPTION 'Invalid organisation name length';
  END IF;

  -- Already completed? Replay returns the stored result (no new rows).
  v_op := public._provisioning_get_op('root_tenant', p_idempotency_key);
  IF v_op IS NOT NULL AND (v_op->>'status') = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'operation_id', v_op->>'id',
      'status', 'completed',
      'tenant_id', v_op->>'target_tenant_id',
      'org_id', p_org_id,
      'message', 'Provisioning already completed'
    );
  END IF;

  v_org := public._provisioning_get_org(p_org_id);
  v_org_tenant := (v_org->>'tenant_id')::uuid;

  -- Resume support: reuse the tenant created by a previous attempt.
  IF v_op IS NOT NULL AND (v_op->>'target_tenant_id') IS NOT NULL THEN
    v_tenant_id := (v_op->>'target_tenant_id')::uuid;
  END IF;

  -- Tenant creation (only when not already linked/resumed).
  IF v_tenant_id IS NULL THEN
    IF v_org_tenant IS NOT NULL THEN
      RAISE EXCEPTION 'Organisation is already linked to a tenant';
    END IF;
    INSERT INTO public.tenants (name, org_type, subscription_status)
    VALUES (p_org_name, p_org_type, 'active')
    RETURNING id INTO v_tenant_id;
    v_created_tenant := true;
  END IF;

  -- Link the organisation to the tenant (idempotent when already linked to
  -- the same tenant).
  IF v_org_tenant IS NOT NULL AND v_org_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'Organisation is already linked to a different tenant';
  END IF;
  UPDATE public.organisations
    SET tenant_id = v_tenant_id
  WHERE id = p_org_id
    AND tenant_id IS DISTINCT FROM v_tenant_id;

  -- Link the admin profile (only when profile has no other tenant).
  PERFORM public._provisioning_link_profile(p_user_id, v_tenant_id, p_org_name || ' Admin');

  -- Finalise the operation record.
  v_op_id := public._provisioning_upsert_op(
    'root_tenant', p_idempotency_key, 'completed', v_uid,
    p_org_id, v_tenant_id, p_user_id, NULL
  );

  -- Audit (reuses the tenant access audit log; superadmin read).
  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    v_uid, 'superadmin', v_tenant_id, p_org_id,
    'tenant_provisioned', 'Root tenant provisioning finalised',
    jsonb_build_object('tenant_id', NULL, 'org_id', NULL),
    jsonb_build_object('tenant_id', v_tenant_id, 'org_id', p_org_id,
                       'target_user_id', p_user_id),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'status', 'completed',
    'tenant_id', v_tenant_id,
    'org_id', p_org_id,
    'target_user_id', p_user_id,
    'message', 'Tenant provisioning completed'
  );
EXCEPTION WHEN OTHERS THEN
  IF p_idempotency_key IS NOT NULL AND v_op_id IS NULL THEN
    BEGIN
      PERFORM public._provisioning_upsert_op(
        'root_tenant', p_idempotency_key, 'failed', v_uid,
        p_org_id, v_tenant_id, p_user_id, NULL, SQLSTATE
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RAISE;
END;
$$;

--------------------------------------------------------------------------------
-- 6. CHILD ORGANISATION FINALISATION
--------------------------------------------------------------------------------
-- Called by the trusted provisioning endpoint with the ACTING ADMIN's JWT.
-- Authorised actor: superadmin OR an enabled tenant admin whose hierarchy
-- contains the parent organisation. Never accepts a password.
CREATE OR REPLACE FUNCTION public.finalise_child_organisation_provisioning(
  p_parent_id uuid,
  p_user_id uuid,
  p_org_name text,
  p_org_type text,
  p_username text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_parent jsonb;
  v_parent_tenant uuid;
  v_parent_tenant_disabled boolean;
  v_new_tenant_id uuid;
  v_new_org_id uuid;
  v_op jsonb;
  v_op_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 128 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;

  -- Username: strict, safe charset, bounded length. Never a password.
  IF p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,40}$' THEN
    RAISE EXCEPTION 'Invalid username: 3-40 lowercase letters, digits or underscores';
  END IF;

  IF p_org_type IS NULL OR p_org_type NOT IN ('unit', 'sector', 'division', 'district', 'state') THEN
    RAISE EXCEPTION 'Invalid organisation type';
  END IF;

  IF p_org_name IS NULL OR length(p_org_name) < 2 OR length(p_org_name) > 120 THEN
    RAISE EXCEPTION 'Invalid organisation name length';
  END IF;

  -- Already completed? Replay returns the stored result (no new rows).
  v_op := public._provisioning_get_op('child_organisation', p_idempotency_key);
  IF v_op IS NOT NULL AND (v_op->>'status') = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'operation_id', v_op->>'id',
      'status', 'completed',
      'tenant_id', v_op->>'target_tenant_id',
      'org_id', v_op->>'target_organisation_id',
      'message', 'Provisioning already completed'
    );
  END IF;

  -- Resume support: reuse rows created by a previous attempt. The username
  -- uniqueness check below only applies when creating a brand-new organisation.
  IF v_op IS NOT NULL AND (v_op->>'target_tenant_id') IS NOT NULL THEN
    v_new_tenant_id := (v_op->>'target_tenant_id')::uuid;
  END IF;
  IF v_op IS NOT NULL AND (v_op->>'target_organisation_id') IS NOT NULL THEN
    v_new_org_id := (v_op->>'target_organisation_id')::uuid;
  END IF;

  v_parent := public._provisioning_get_org(p_parent_id);
  v_parent_tenant := (v_parent->>'tenant_id')::uuid;

  -- Hierarchy + tenant-enabled authorization (superadmin bypasses).
  IF NOT public.is_superadmin() THEN
    -- Disabled tenants: get_my_tenant_id() returns NULL after 098, so the
    -- caller must have an enabled tenant to proceed.
    IF public.get_my_tenant_id() IS NULL THEN
      RAISE EXCEPTION 'Permission denied: tenant access required';
    END IF;
    -- The parent must sit inside the caller's own visible hierarchy
    -- (own organisation or a descendant). Sibling/unrelated/above denied.
    IF NOT public.is_org_visible(p_parent_id) THEN
      RAISE EXCEPTION 'Permission denied: parent organisation is not within your hierarchy';
    END IF;
  END IF;

  -- A child cannot be provisioned under an organisation without a tenant or
  -- under a disabled tenant.
  IF v_parent_tenant IS NULL THEN
    RAISE EXCEPTION 'Parent organisation is not linked to a tenant';
  END IF;
  SELECT COALESCE(access_disabled, false) INTO v_parent_tenant_disabled
  FROM public.tenants WHERE id = v_parent_tenant;
  IF v_parent_tenant_disabled THEN
    RAISE EXCEPTION 'Permission denied: parent tenant access is disabled';
  END IF;

  -- Username must not already be in use (only when creating a new org; on
  -- resume the org may already own this username).
  IF v_new_org_id IS NULL AND EXISTS (
    SELECT 1 FROM public.organisations WHERE admin_email = p_username
  ) THEN
    RAISE EXCEPTION 'Username already in use';
  END IF;

  IF v_new_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, org_type, subscription_status)
    VALUES (p_org_name, p_org_type, 'active')
    RETURNING id INTO v_new_tenant_id;
  END IF;

  -- Child organisation (own tenant + parent link). No plaintext anywhere.
  IF v_new_org_id IS NULL THEN
    INSERT INTO public.organisations (tenant_id, name, org_type, parent_id, admin_email)
    VALUES (v_new_tenant_id, p_org_name, p_org_type, p_parent_id, p_username)
    RETURNING id INTO v_new_org_id;
    UPDATE public.tenants SET organisation_id = v_new_org_id
      WHERE id = v_new_tenant_id;
  END IF;

  -- Child admin profile (only when profile has no other tenant).
  PERFORM public._provisioning_link_profile(p_user_id, v_new_tenant_id, p_org_name || ' Admin');

  v_op_id := public._provisioning_upsert_op(
    'child_organisation', p_idempotency_key, 'completed', v_uid,
    v_new_org_id, v_new_tenant_id, p_user_id, p_username
  );

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    v_uid,
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_new_tenant_id, v_new_org_id,
    'child_organisation_provisioned', 'Child organisation provisioning finalised',
    jsonb_build_object('tenant_id', NULL, 'org_id', NULL),
    jsonb_build_object('tenant_id', v_new_tenant_id, 'org_id', v_new_org_id,
                       'parent_id', p_parent_id, 'target_user_id', p_user_id),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'status', 'completed',
    'tenant_id', v_new_tenant_id,
    'org_id', v_new_org_id,
    'parent_id', p_parent_id,
    'target_user_id', p_user_id,
    'message', 'Child organisation provisioning completed'
  );
EXCEPTION WHEN OTHERS THEN
  IF p_idempotency_key IS NOT NULL AND v_op_id IS NULL THEN
    BEGIN
      PERFORM public._provisioning_upsert_op(
        'child_organisation', p_idempotency_key, 'failed', v_uid,
        v_new_org_id, v_new_tenant_id, p_user_id, p_username, SQLSTATE
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RAISE;
END;
$$;

--------------------------------------------------------------------------------
-- 7. LEGACY CONTRACT NEUTRALISATION (C2.1)
--------------------------------------------------------------------------------
-- setup_tenant_records(uuid, uuid, text, text) - retained as a strict
-- superadmin-only compatibility name that delegates to the safe finalisation
-- RPC. No password parameter ever existed in the signature; callers that sent
-- extra keys (p_admin_email/p_admin_pass) now fail at PostgREST and are
-- replaced by the trusted endpoint flow.
CREATE OR REPLACE FUNCTION public.setup_tenant_records(
  p_org_id uuid,
  p_user_id uuid,
  p_org_name text,
  p_org_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.finalise_tenant_provisioning(
    p_org_id, p_user_id, p_org_name, p_org_type, NULL
  );
END;
$$;

-- setup_child_organisation: the old 6-parameter overload accepted a plaintext
-- temporary password (p_password_temp) and stored it in
-- organisations.admin_password_temp. It is DROPPED - never leave a weaker
-- overload as a bypass. A safe 5-parameter overload keeps the call name.
DROP FUNCTION IF EXISTS public.setup_child_organisation(uuid, uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.setup_child_organisation(
  p_parent_id uuid,
  p_new_user_id uuid,
  p_org_name text,
  p_org_type text,
  p_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.finalise_child_organisation_provisioning(
    p_parent_id, p_new_user_id, p_org_name, p_org_type, p_username, NULL
  );
END;
$$;

-- Grants: legacy names and finalisation RPCs are authenticated-only.
REVOKE ALL ON FUNCTION public.setup_tenant_records(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.setup_tenant_records(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.setup_tenant_records(uuid, uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.setup_child_organisation(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.setup_child_organisation(uuid, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.setup_child_organisation(uuid, uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.finalise_tenant_provisioning(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalise_tenant_provisioning(uuid, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalise_tenant_provisioning(uuid, uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.finalise_child_organisation_provisioning(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalise_child_organisation_provisioning(uuid, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalise_child_organisation_provisioning(uuid, uuid, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
