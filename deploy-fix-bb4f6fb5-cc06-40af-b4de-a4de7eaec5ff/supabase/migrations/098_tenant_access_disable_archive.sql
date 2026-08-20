-- 098_tenant_access_disable_archive.sql
-- C3: Neutralise unsafe tenant revoke behavior, add reversible tenant
-- disable/re-enable, and replace the missing child-org delete with safe
-- reversible archive behavior.
--
-- Scope (approved product decisions):
--   * Disable first; never hard-delete by default.
--   * Preserve all festival data, tenant/org history, profiles and auth users.
--   * "Delete child organisation" becomes a reversible archive.
--   * Superadmin may disable/re-enable any tenant and archive any child org.
--   * Parent tenant admin may archive an authorised descendant child org only.
--   * Normal authenticated members and anonymous callers are denied.
--   * Legacy revoke_tenant_access is replaced by a superadmin-only wrapper
--     that safely disables (no auth-user / tenant / org deletion, no unlink).
--   * Legacy delete_child_organisation is replaced by an authorised wrapper
--     that safely archives (no physical deletion).
--   * All privileged RPCs: SECURITY DEFINER, safe search_path, PUBLIC/anon
--     execute revoked, authenticated-only grant, safe errors, no dynamic SQL.
--
-- Forward-only. NOT to be applied to Supabase until reviewed.

BEGIN;

--------------------------------------------------------------------------------
-- 1. SCHEMA: smallest forward-only status fields
--------------------------------------------------------------------------------

-- Tenant access flag (disable/re-enable). Do not overload subscription_status.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS access_disabled boolean NOT NULL DEFAULT false;

-- Child organisation archive marker (NULL = active).
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

--------------------------------------------------------------------------------
-- 2. DEDICATED AUDIT TABLE (smallest general tenant/admin access audit)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_access_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_role text,
  target_tenant_id uuid,
  target_organisation_id uuid,
  action text NOT NULL,
  reason text,
  previous_status jsonb,
  new_status jsonb,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_access_audit_tenant
  ON public.tenant_access_audit_logs (target_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_access_audit_org
  ON public.tenant_access_audit_logs (target_organisation_id, created_at DESC);

ALTER TABLE public.tenant_access_audit_logs ENABLE ROW LEVEL SECURITY;

-- Read: superadmin only. Writes happen exclusively inside SECURITY DEFINER
-- functions (owner bypasses RLS); no client INSERT/UPDATE/DELETE policy.
DROP POLICY IF EXISTS "Superadmins read tenant access audit"
  ON public.tenant_access_audit_logs;
CREATE POLICY "Superadmins read tenant access audit"
  ON public.tenant_access_audit_logs FOR SELECT TO authenticated
  USING (public.is_superadmin());

--------------------------------------------------------------------------------
-- 3. INTERNAL AUTHORIZATION HELPERS (no client execute grant)
--------------------------------------------------------------------------------

-- Superadmin-only gate used by disable/enable/legacy-revoke wrappers.
CREATE OR REPLACE FUNCTION public._assert_superadmin_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Permission denied: superadmin access required';
  END IF;
END;
$$;

-- Hierarchy gate used by archive/restore:
--   * authenticated caller required
--   * superadmin may target any existing organisation
--   * parent tenant admin may target any descendant organisation (never their own)
--   * the caller's own tenant must be enabled (a disabled tenant's admin is blocked)
CREATE OR REPLACE FUNCTION public._assert_organisation_hierarchy_access(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organisations WHERE id = p_org_id
  ) THEN
    RAISE EXCEPTION 'Organisation not found';
  END IF;

  IF public.is_superadmin() THEN
    RETURN;
  END IF;

  -- Normal authenticated members (judge/volunteer/participant) are denied.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid
      AND COALESCE(
        p.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin', 'admin_leader', 'superadmin'),
        false
      )
  ) THEN
    RAISE EXCEPTION 'Permission denied: admin access required';
  END IF;

  -- Caller must be a tenant admin with an enabled tenant. Since the corrected
  -- get_my_tenant_id() (section 3B) returns NULL for a disabled tenant, this
  -- branch denies disabled admins before the explicit check below can run.
  IF public.get_my_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Permission denied: tenant access required';
  END IF;

  -- Defensive second layer: only reachable if get_my_tenant_id() semantics are
  -- ever changed to return an id for a disabled tenant.
  IF EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = public.get_my_tenant_id()
      AND t.access_disabled = true
  ) THEN
    RAISE EXCEPTION 'Permission denied: tenant access is disabled';
  END IF;

  IF public.get_my_org_id() IS NULL THEN
    RAISE EXCEPTION 'Permission denied: organisation hierarchy access required';
  END IF;

  -- Target must be within the caller's descendant tree, and never the caller's
  -- own organisation. Siblings, parents, and unrelated orgs are rejected.
  IF NOT (
    public.is_org_visible(p_org_id)
    AND p_org_id <> public.get_my_org_id()
  ) THEN
    RAISE EXCEPTION 'Permission denied: target organisation is not within your hierarchy';
  END IF;
END;
$$;

-- No client execute grant for either helper.
REVOKE ALL ON FUNCTION public._assert_superadmin_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_superadmin_access() FROM anon;
REVOKE ALL ON FUNCTION public._assert_superadmin_access() FROM authenticated;
REVOKE ALL ON FUNCTION public._assert_organisation_hierarchy_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_organisation_hierarchy_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._assert_organisation_hierarchy_access(uuid) FROM authenticated;

--------------------------------------------------------------------------------
-- 3B. SERVER-SIDE TENANT-ENABLED ENFORCEMENT (get_my_tenant_id correction)
--------------------------------------------------------------------------------
-- Review finding: get_my_tenant_id() previously returned the profile tenant_id
-- whenever the JWT was valid, WITHOUT checking tenants.access_disabled. A
-- disabled tenant's already-issued JWT therefore continued to satisfy every
-- tenant-scoped RLS policy and RPC gate. Frontend-only guards are not
-- authoritative.
--
-- Correction: get_my_tenant_id() returns the caller's profile tenant_id ONLY
-- when the profile exists, the linked tenant row exists, and
-- tenants.access_disabled = false. Every other case returns NULL, which is a
-- safe denial:
--   * equality policies (tenant_id = get_my_tenant_id()) yield NULL -> denied;
--   * RPC gates that RAISE on get_my_tenant_id() IS NULL deny the call;
--   * is_org_visible()/get_visible_organisations(NULL) return empty sets.
-- Superadmin access is NOT folded into this helper: it continues exclusively
-- through explicit public.is_superadmin() branches in policies and RPCs, so a
-- disabled tenant can never regain access via get_my_tenant_id(), while
-- superadmin flows (list, disable, re-enable, archive) are unaffected.
-- Signature, volatility and SECURITY DEFINER are preserved; execution grants
-- keep the existing PUBLIC default so every pre-existing RLS policy and RPC
-- that calls get_my_tenant_id() continues to resolve.
CREATE OR REPLACE FUNCTION public.get_my_tenant_id() RETURNS uuid AS $$
  SELECT p.tenant_id
  FROM public.profiles p
  JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.id = auth.uid()
    AND t.access_disabled = false;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- get_my_access_status(): authenticated-only status RPC used by the frontend
-- tenant-enabled guard. SECURITY DEFINER so the caller's OWN access state stays
-- readable even though the tenants RLS policy hides the disabled tenant's row
-- (id = get_my_tenant_id() -> NULL while disabled). Returns only the caller's
-- own profile/tenant data; no cross-tenant information is exposed.
CREATE OR REPLACE FUNCTION public.get_my_access_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  SELECT jsonb_build_object(
    'authenticated', true,
    'tenant_id', p.tenant_id,
    'access_disabled', COALESCE(t.access_disabled, false),
    'superadmin', COALESCE(p.is_superadmin, false)
  )
  INTO v_result
  FROM public.profiles p
  LEFT JOIN public.tenants t ON t.id = p.tenant_id
  WHERE p.id = v_uid;

  -- No profile row: treat as not tenant-scoped (participant/superadmin-only).
  IF v_result IS NULL THEN
    RETURN jsonb_build_object(
      'authenticated', true,
      'tenant_id', NULL,
      'access_disabled', false,
      'superadmin', false
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_access_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_access_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_access_status() TO authenticated;

--------------------------------------------------------------------------------
-- 4. TENANT DISABLE
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disable_tenant_access(
  p_org_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_was_disabled boolean;
BEGIN
  PERFORM public._assert_superadmin_access();

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation is required';
  END IF;

  SELECT t.id, COALESCE(t.access_disabled, false)
    INTO v_tenant_id, v_was_disabled
  FROM public.organisations o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.id = p_org_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Organisation not found or not linked to a tenant';
  END IF;

  -- Idempotent: no-op when already disabled.
  IF v_was_disabled THEN
    RETURN jsonb_build_object(
      'success', true,
      'tenant_id', v_tenant_id,
      'org_id', p_org_id,
      'state', 'disabled',
      'message', 'Tenant access was already disabled'
    );
  END IF;

  UPDATE public.tenants SET access_disabled = true WHERE id = v_tenant_id;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(), 'superadmin', v_tenant_id, p_org_id,
    'tenant_disabled', p_reason,
    jsonb_build_object('access_disabled', false),
    jsonb_build_object('access_disabled', true),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'org_id', p_org_id,
    'state', 'disabled',
    'message', 'Tenant access disabled. Festival data and history are preserved. This action can be reversed.'
  );
END;
$$;

--------------------------------------------------------------------------------
-- 5. TENANT RE-ENABLE
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enable_tenant_access(
  p_org_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_was_disabled boolean;
  v_admin_exists boolean;
BEGIN
  PERFORM public._assert_superadmin_access();

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organisation is required';
  END IF;

  SELECT t.id, COALESCE(t.access_disabled, false)
    INTO v_tenant_id, v_was_disabled
  FROM public.organisations o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.id = p_org_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Organisation not found or not linked to a tenant';
  END IF;

  -- Idempotent: no-op when already enabled.
  IF NOT v_was_disabled THEN
    RETURN jsonb_build_object(
      'success', true,
      'tenant_id', v_tenant_id,
      'org_id', p_org_id,
      'state', 'enabled',
      'message', 'Tenant access was already enabled'
    );
  END IF;

  UPDATE public.tenants SET access_disabled = false WHERE id = v_tenant_id;

  -- If a historical revoke removed the admin auth account, report it clearly.
  -- We never recreate credentials or profiles.
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE p.tenant_id = v_tenant_id
      AND p.role = 'admin'
  ) INTO v_admin_exists;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(), 'superadmin', v_tenant_id, p_org_id,
    'tenant_enabled', p_reason,
    jsonb_build_object('access_disabled', true),
    jsonb_build_object('access_disabled', false),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'org_id', p_org_id,
    'state', CASE WHEN v_admin_exists THEN 'enabled' ELSE 'TENANT_ENABLED_BUT_ADMIN_ACCOUNT_MISSING' END,
    'message', CASE WHEN v_admin_exists THEN 'Tenant access re-enabled.' ELSE 'Tenant access re-enabled, but no admin auth account was found. No credentials were created.' END
  );
END;
$$;

--------------------------------------------------------------------------------
-- 6. CHILD ORGANISATION ARCHIVE
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_child_organisation(
  p_org_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_was_archived boolean;
BEGIN
  PERFORM public._assert_organisation_hierarchy_access(p_org_id);

  SELECT o.tenant_id, o.archived_at IS NOT NULL
    INTO v_tenant_id, v_was_archived
  FROM public.organisations o
  WHERE o.id = p_org_id;

  -- Idempotent: no-op when already archived.
  IF v_was_archived THEN
    RETURN jsonb_build_object(
      'success', true,
      'org_id', p_org_id,
      'state', 'archived',
      'message', 'Organisation was already archived'
    );
  END IF;

  UPDATE public.organisations
    SET archived_at = now()
  WHERE id = p_org_id;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(),
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_tenant_id, p_org_id,
    'child_organisation_archived', p_reason,
    jsonb_build_object('archived_at', NULL),
    jsonb_build_object('archived_at', now()),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'org_id', p_org_id,
    'state', 'archived',
    'message', 'Organisation archived. Participant, registration, result and festival history are preserved.'
  );
END;
$$;

--------------------------------------------------------------------------------
-- 7. CHILD ORGANISATION RESTORE
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_child_organisation(
  p_org_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_was_archived boolean;
BEGIN
  PERFORM public._assert_organisation_hierarchy_access(p_org_id);

  SELECT o.tenant_id, o.archived_at IS NOT NULL
    INTO v_tenant_id, v_was_archived
  FROM public.organisations o
  WHERE o.id = p_org_id;

  -- Idempotent: no-op when already restored.
  IF NOT v_was_archived THEN
    RETURN jsonb_build_object(
      'success', true,
      'org_id', p_org_id,
      'state', 'active',
      'message', 'Organisation was not archived'
    );
  END IF;

  UPDATE public.organisations
    SET archived_at = NULL
  WHERE id = p_org_id;

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    auth.uid(),
    CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'tenant_admin' END,
    v_tenant_id, p_org_id,
    'child_organisation_restored', p_reason,
    jsonb_build_object('archived_at', v_was_archived),
    jsonb_build_object('archived_at', NULL),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'org_id', p_org_id,
    'state', 'active',
    'message', 'Organisation restored and visible again.'
  );
END;
$$;

--------------------------------------------------------------------------------
-- 8. LEGACY COMPATIBILITY WRAPPERS (destructive paths removed)
--------------------------------------------------------------------------------

-- revoke_tenant_access(p_org_id uuid) -> superadmin-only safe disable.
-- No auth-user/identity deletion, no tenant deletion, no org unlink.
CREATE OR REPLACE FUNCTION public.revoke_tenant_access(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_result jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Permission denied: superadmin access required';
  END IF;

  v_result := public.disable_tenant_access(
    p_org_id,
    'Legacy revoke_tenant_access compatibility call'
  );

  IF (v_result->>'success') = 'true' THEN
    INSERT INTO public.tenant_access_audit_logs (
      actor_user_id, actor_role, target_tenant_id, target_organisation_id,
      action, reason, success
    ) VALUES (
      v_uid, 'superadmin',
      (v_result->>'tenant_id')::uuid, p_org_id,
      'legacy_revoke_redirected',
      'Legacy revoke_tenant_access redirected to safe disable',
      true
    );
  END IF;

  RETURN v_result;
END;
$$;

-- delete_child_organisation(p_org_id uuid) -> authorised safe archive.
-- Does not physically delete the organisation or any data.
CREATE OR REPLACE FUNCTION public.delete_child_organisation(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.archive_child_organisation(
    p_org_id,
    'Legacy delete_child_organisation compatibility call'
  );
END;
$$;

--------------------------------------------------------------------------------
-- 9. GRANT HYGIENE: deny PUBLIC/anon, grant only to authenticated
--------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.disable_tenant_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disable_tenant_access(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.disable_tenant_access(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.enable_tenant_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enable_tenant_access(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.enable_tenant_access(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_child_organisation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_child_organisation(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_child_organisation(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.restore_child_organisation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_child_organisation(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_child_organisation(uuid, text) TO authenticated;

-- Legacy revoke (replaced above): revoke default PUBLIC/anon, keep authenticated.
REVOKE ALL ON FUNCTION public.revoke_tenant_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_tenant_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_access(uuid) TO authenticated;

-- Legacy child delete (created above): deny PUBLIC/anon, grant authenticated.
REVOKE ALL ON FUNCTION public.delete_child_organisation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_child_organisation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_child_organisation(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 10. CLOSE THE WIDE-OPEN ORGANISATION WRITE POLICY
--------------------------------------------------------------------------------
-- 007 "Admins full access to organisations" (FOR ALL USING(true)) was a
-- prototype leftover that let ANY authenticated user directly INSERT/UPDATE/
-- DELETE any organisation row via PostgREST, bypassing all RPC gates.
-- Superadmin writes remain covered by 014 "Superadmins full control
-- organisations" (FOR ALL USING is_superadmin). Child creation already runs
-- through the SECURITY DEFINER setup_child_organisation RPC.
DROP POLICY IF EXISTS "Admins full access to organisations"
  ON public.organisations;

NOTIFY pgrst, 'reload schema';

COMMIT;
