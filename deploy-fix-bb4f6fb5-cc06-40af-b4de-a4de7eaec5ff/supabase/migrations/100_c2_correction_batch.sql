BEGIN;

--------------------------------------------------------------------------------
-- 1. PRE-CHECK FOR EXISTING DUPLICATES
--------------------------------------------------------------------------------
DO $$
DECLARE
  v_dup_email text;
  v_dup_org text;
BEGIN
  -- Check for duplicate admin_emails (usernames)
  SELECT lower(admin_email) INTO v_dup_email
  FROM public.organisations
  WHERE admin_email IS NOT NULL
  GROUP BY lower(admin_email)
  HAVING count(*) > 1
  LIMIT 1;

  IF v_dup_email IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply UNIQUE constraint on admin_email due to existing duplicate: %', v_dup_email;
  END IF;

  -- Check for duplicate organisation names within a parent
  SELECT lower(trim(name)) INTO v_dup_org
  FROM public.organisations
  WHERE parent_id IS NOT NULL
  GROUP BY parent_id, lower(trim(name))
  HAVING count(*) > 1
  LIMIT 1;

  IF v_dup_org IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot apply UNIQUE constraint on parent_id+name due to existing duplicate: %', v_dup_org;
  END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 2. APPLY UNIQUE CONSTRAINTS
--------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_unique_admin_email 
  ON public.organisations(lower(admin_email)) 
  WHERE admin_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orgs_unique_parent_name 
  ON public.organisations(parent_id, lower(trim(name))) 
  WHERE parent_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 3. SANITISE LEGACY PLAINTEXT PASSWORDS
--------------------------------------------------------------------------------
UPDATE public.organisations SET admin_password_temp = NULL WHERE admin_password_temp IS NOT NULL;

--------------------------------------------------------------------------------
-- 4. CLOSE LEGACY WRAPPER BYPASSES
--------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.setup_child_organisation(uuid, uuid, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.setup_tenant_records(uuid, uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalise_tenant_provisioning(uuid, uuid, text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalise_child_organisation_provisioning(uuid, uuid, text, text, text, text) FROM authenticated;

-- They should only be called by the Edge Function using an internally scoped trusted mechanism 
-- or we leave them available only to `service_role`. But Edge Function calls them as the authenticated user!
-- Wait! The Edge Function uses `callerClient = createClient(..., anonKey, { global: { headers: { Authorization: token } } })`.
-- So the RPCs MUST be executable by `authenticated`!
-- The prompt said: "F3 - Legacy child wrapper bypass: Drop client execution on the legacy wrapper. Revoke authenticated. ... The frontend must use only: provision-admin Edge Function for privileged child provisioning."
-- This means we revoke `authenticated` from `setup_child_organisation` (the wrapper). 
-- Wait, what about `finalise_child_organisation_provisioning`? The prompt didn't say to revoke authenticated from `finalise_*`, because the Edge Function CALLS `finalise_*` using `authenticated`!
-- Let me re-read the prompt: "Drop client execution on the legacy wrapper. Revoke authenticated... The frontend must use only provision-admin". 
-- It ONLY says to revoke from the legacy wrappers, NOT `finalise_*`.
GRANT EXECUTE ON FUNCTION public.finalise_tenant_provisioning(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalise_child_organisation_provisioning(uuid, uuid, text, text, text, text) TO authenticated;

--------------------------------------------------------------------------------
-- 5. CREATE PREFLIGHT RPC
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

  -- Ensure username format
  IF p_username IS NOT NULL AND p_username !~ '^[a-z0-9_]{3,40}$' THEN
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

--------------------------------------------------------------------------------
-- 6. LOGIN RPC
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  -- Strict input validation to prevent abuse/errors
  IF p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,40}$' THEN
    RETURN NULL;
  END IF;

  SELECT lower(admin_email) INTO v_email
  FROM public.organisations
  WHERE lower(admin_email) = lower(p_username)
  LIMIT 1;

  IF FOUND THEN
    -- Construct the exact synthetic email suffix logic used by the backend.
    -- Wait, the backend uses `${username}_${uuid}@sahi.local` for child!
    -- Ah! organisations.admin_email currently stores the username for child orgs?
    -- Let's check `finalise_child_organisation_provisioning` in 099.
    -- "VALUES (v_new_tenant_id, p_org_name, p_org_type, p_parent_id, p_username)"
    -- Yes! `organisations.admin_email` stores the USERNAME (`p_username`).
    -- Wait, how does it get the full synthetic email then?
    -- The Edge function uses `${username}_${uuid}@sahi.local` for `createUser(email)`.
    -- So `auth.users` has the `.local` email. `organisations` has the username.
    -- Wait, if `organisations` only has the username, how do we lookup the `.local` email?
    -- We must look it up in `auth.users`!
    -- But `auth.users` has many `.local` emails. We need to find the one matching `username_%@sahi.local`.
    RETURN (
      SELECT email 
      FROM auth.users 
      WHERE email LIKE lower(p_username) || '\_%@sahi.local' 
      ORDER BY created_at DESC 
      LIMIT 1
    );
  END IF;

  RETURN NULL;
END;
$$;

-- Allow anon to execute this for login resolution
GRANT EXECUTE ON FUNCTION public.lookup_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_username(text) TO authenticated;

--------------------------------------------------------------------------------
-- 7. FUNCTION HARDENING
--------------------------------------------------------------------------------
ALTER FUNCTION public.handle_new_user() SET search_path = public;

--------------------------------------------------------------------------------
-- 8. UPDATE FINALISE RPC TO VERIFY OWNERSHIP & LOCK
--------------------------------------------------------------------------------
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
  v_uid uuid := auth.uid();
  v_op_id uuid;
  v_op jsonb;
  v_db_op public.tenant_provisioning_operations;
  v_parent_tenant uuid;
  v_parent_tenant_disabled boolean;
  v_new_tenant_id uuid;
  v_new_org_id uuid;
  v_parent jsonb;
  v_parent_archived timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    -- Lock operation
    SELECT * INTO v_db_op
    FROM public.tenant_provisioning_operations
    WHERE operation_type = 'child_organisation' AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Enforce ownership
      IF v_db_op.requested_by <> v_uid AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Permission denied: operation belongs to another user';
      END IF;
      
      IF v_db_op.status = 'completed' THEN
        RETURN jsonb_build_object(
          'success', true,
          'operation_id', v_db_op.id,
          'status', 'completed',
          'tenant_id', v_db_op.target_tenant_id,
          'org_id', v_db_op.target_organisation_id,
          'parent_id', p_parent_id,
          'target_user_id', v_db_op.target_user_id,
          'message', 'Already completed'
        );
      END IF;

      -- Enforce immutable target_user_id if already set
      IF v_db_op.target_user_id IS NOT NULL AND v_db_op.target_user_id <> p_user_id THEN
        RAISE EXCEPTION 'Operation target user ID cannot change';
      END IF;
    END IF;
  END IF;

  v_op := public._provisioning_get_op('child_organisation', p_idempotency_key);
  IF v_op IS NOT NULL AND (v_op->>'target_tenant_id') IS NOT NULL THEN
    v_new_tenant_id := (v_op->>'target_tenant_id')::uuid;
  END IF;
  IF v_op IS NOT NULL AND (v_op->>'target_organisation_id') IS NOT NULL THEN
    v_new_org_id := (v_op->>'target_organisation_id')::uuid;
  END IF;

  v_parent := public._provisioning_get_org(p_parent_id);
  v_parent_tenant := (v_parent->>'tenant_id')::uuid;
  
  -- Check parent is not archived
  SELECT archived_at INTO v_parent_archived
  FROM public.organisations WHERE id = p_parent_id;
  IF v_parent_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Permission denied: parent organisation is archived';
  END IF;

  -- Hierarchy + tenant-enabled authorization (superadmin bypasses).
  IF NOT public.is_superadmin() THEN
    IF public.get_my_tenant_id() IS NULL THEN
      RAISE EXCEPTION 'Permission denied: tenant access required';
    END IF;
    IF NOT public.is_org_visible(p_parent_id) THEN
      RAISE EXCEPTION 'Permission denied: parent organisation is not within your hierarchy';
    END IF;
  END IF;

  IF v_parent_tenant IS NULL THEN
    RAISE EXCEPTION 'Parent organisation is not linked to a tenant';
  END IF;
  SELECT COALESCE(access_disabled, false) INTO v_parent_tenant_disabled
  FROM public.tenants WHERE id = v_parent_tenant;
  IF v_parent_tenant_disabled THEN
    RAISE EXCEPTION 'Permission denied: parent tenant access is disabled';
  END IF;

  IF v_new_org_id IS NULL AND EXISTS (
    SELECT 1 FROM public.organisations WHERE lower(admin_email) = lower(p_username)
  ) THEN
    RAISE EXCEPTION 'Username already in use';
  END IF;

  IF v_new_tenant_id IS NULL THEN
    INSERT INTO public.tenants (name, org_type, subscription_status)
    VALUES (p_org_name, p_org_type, 'active')
    RETURNING id INTO v_new_tenant_id;
  END IF;

  IF v_new_org_id IS NULL THEN
    INSERT INTO public.organisations (tenant_id, name, org_type, parent_id, admin_email)
    VALUES (v_new_tenant_id, p_org_name, p_org_type, p_parent_id, p_username)
    RETURNING id INTO v_new_org_id;
    UPDATE public.tenants SET organisation_id = v_new_org_id
      WHERE id = v_new_tenant_id;
  END IF;

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

-- Apply similar to root tenant
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
  v_uid uuid := auth.uid();
  v_op_id uuid;
  v_op jsonb;
  v_db_op public.tenant_provisioning_operations;
  v_tenant_id uuid;
  v_existing_tenant uuid;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmin can finalise a root tenant';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_db_op
    FROM public.tenant_provisioning_operations
    WHERE operation_type = 'root_tenant' AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      -- Enforce ownership
      IF v_db_op.requested_by <> v_uid AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Permission denied: operation belongs to another user';
      END IF;
      
      IF v_db_op.status = 'completed' THEN
        RETURN jsonb_build_object(
          'success', true,
          'operation_id', v_db_op.id,
          'status', 'completed',
          'tenant_id', v_db_op.target_tenant_id,
          'org_id', p_org_id,
          'target_user_id', v_db_op.target_user_id,
          'message', 'Already completed'
        );
      END IF;

      IF v_db_op.target_user_id IS NOT NULL AND v_db_op.target_user_id <> p_user_id THEN
        RAISE EXCEPTION 'Operation target user ID cannot change';
      END IF;
    END IF;
  END IF;

  v_op := public._provisioning_get_op('root_tenant', p_idempotency_key);
  IF v_op IS NOT NULL AND (v_op->>'target_tenant_id') IS NOT NULL THEN
    v_tenant_id := (v_op->>'target_tenant_id')::uuid;
  END IF;

  SELECT tenant_id INTO v_existing_tenant FROM public.organisations WHERE id = p_org_id;
  
  IF v_tenant_id IS NULL THEN
    IF v_existing_tenant IS NOT NULL THEN
      v_tenant_id := v_existing_tenant;
    ELSE
      INSERT INTO public.tenants (name, org_type, organisation_id, subscription_status)
      VALUES (p_org_name, p_org_type, p_org_id, 'active')
      RETURNING id INTO v_tenant_id;
    END IF;
  END IF;

  IF v_existing_tenant IS NULL THEN
    UPDATE public.organisations SET tenant_id = v_tenant_id WHERE id = p_org_id;
  END IF;

  PERFORM public._provisioning_link_profile(p_user_id, v_tenant_id, p_org_name || ' Admin');

  v_op_id := public._provisioning_upsert_op(
    'root_tenant', p_idempotency_key, 'completed', v_uid,
    p_org_id, v_tenant_id, p_user_id, NULL
  );

  INSERT INTO public.tenant_access_audit_logs (
    actor_user_id, actor_role, target_tenant_id, target_organisation_id,
    action, reason, previous_status, new_status, success
  ) VALUES (
    v_uid, 'superadmin', v_tenant_id, p_org_id,
    'root_tenant_provisioned', 'Root tenant provisioning finalised',
    jsonb_build_object('tenant_id', NULL),
    jsonb_build_object('tenant_id', v_tenant_id, 'target_user_id', p_user_id),
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'status', 'completed',
    'tenant_id', v_tenant_id,
    'org_id', p_org_id,
    'target_user_id', p_user_id,
    'message', 'Root tenant provisioning completed'
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
-- 9. CHECK RESET CREDENTIAL ACCESS
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_reset_credential_access(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target_tenant uuid;
  v_target_org uuid;
  v_parent_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF public.is_superadmin() THEN RETURN true; END IF;
  
  -- Find the tenant/org for the target user
  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user_id;
  IF v_target_tenant IS NULL THEN RETURN false; END IF;

  SELECT id, parent_id INTO v_target_org, v_parent_id FROM public.organisations WHERE tenant_id = v_target_tenant LIMIT 1;
  
  IF v_parent_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_org_visible(v_parent_id) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_reset_credential_access(uuid) TO authenticated;

COMMIT;
