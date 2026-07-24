-- ============================================================
-- Migration 013: Hierarchical Organisation Creation
-- Allows Admins to securely create and manage child organisations
-- without Superadmin intervention.
-- ============================================================

-- Allow Admins to INSERT child organisations if they own the parent
-- Wait, we will use SECURITY DEFINER RPC to bypass RLS for creation 
-- to ensure atomicity just like Superadmin onboarding.

CREATE OR REPLACE FUNCTION public.setup_child_organisation(
  p_parent_id uuid,
  p_new_user_id uuid,
  p_org_name text,
  p_org_type text,
  p_username text,
  p_password_temp text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_tenant_id uuid;
  v_new_tenant_id uuid;
  v_new_org_id uuid;
BEGIN
  -- 1. Security Check: Ensure caller manages the parent organisation
  -- Find the tenant_id of the parent organisation
  SELECT tenant_id INTO v_parent_tenant_id FROM organisations WHERE id = p_parent_id;
  
  -- The caller must either be the Ultimate Admin or an admin of the parent's tenant
  IF NOT (public.is_superadmin() OR v_parent_tenant_id = public.get_my_tenant_id()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: You do not manage the parent organisation.');
  END IF;

  -- 2. Create the child's Tenant partition
  INSERT INTO tenants (name, org_type, subscription_status)
  VALUES (p_org_name, p_org_type, 'active')
  RETURNING id INTO v_new_tenant_id;

  -- 3. Create the child Organisation linked to the new Tenant and Parent
  INSERT INTO organisations (tenant_id, name, org_type, parent_id, admin_email, admin_password_temp)
  VALUES (v_new_tenant_id, p_org_name, p_org_type, p_parent_id, p_username, p_password_temp)
  RETURNING id INTO v_new_org_id;

  -- 4. Set up the associated Profile for the new User
  INSERT INTO public.profiles (id, full_name, role, tenant_id, is_superadmin)
  VALUES (p_new_user_id, p_org_name || ' Admin', 'admin', v_new_tenant_id, false)
  ON CONFLICT (id) DO UPDATE 
  SET role = 'admin', tenant_id = v_new_tenant_id, full_name = EXCLUDED.full_name;

  RETURN jsonb_build_object('success', true, 'org_id', v_new_org_id, 'tenant_id', v_new_tenant_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
