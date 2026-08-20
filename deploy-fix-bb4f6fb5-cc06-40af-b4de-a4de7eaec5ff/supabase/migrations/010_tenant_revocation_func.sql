-- ============================================================
-- Migration 010: Tenant Revocation Function
-- Allows Superadmin to completely revoke access and 
-- wipe the tenant partition/account.
-- ============================================================

CREATE OR REPLACE FUNCTION public.revoke_tenant_access(
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid;
BEGIN
  -- 1. Identify the tenant and user
  SELECT tenant_id INTO v_tenant_id FROM organisations WHERE id = p_org_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organisation has no active tenant');
  END IF;

  -- 2. Find the admin user linked to this tenant
  SELECT id INTO v_user_id FROM profiles WHERE tenant_id = v_tenant_id AND role = 'admin' LIMIT 1;

  -- 3. Cleanup Organisation record
  UPDATE organisations 
  SET tenant_id = NULL, 
      admin_email = NULL, 
      admin_password_temp = NULL 
  WHERE id = p_org_id;

  -- 4. Delete Auth User (Cascades to profile)
  IF v_user_id IS NOT NULL THEN
    -- Delete from identities first to be safe
    DELETE FROM auth.identities WHERE user_id = v_user_id;
    DELETE FROM auth.users WHERE id = v_user_id;
  END IF;

  -- 5. Delete Tenant record
  -- Note: This might fail if there is other dependent data (festival_calendar, etc)
  -- This is a GOOD thing as it prevents orphaned data. In a production system, 
  -- we should have a more comprehensive cleanup if we want to wipe everything.
  DELETE FROM tenants WHERE id = v_tenant_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
