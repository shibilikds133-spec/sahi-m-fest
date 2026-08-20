-- ============================================================
-- Migration 009: Tenant Setup Function (Client-assisted)
-- Safely links a Supabase GoTrue user to a new Tenant
-- ============================================================

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
DECLARE
  v_tenant_id uuid;
BEGIN
  -- 1. Check if already has a tenant
  IF EXISTS (SELECT 1 FROM organisations WHERE id = p_org_id AND tenant_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organisation already has a tenant active');
  END IF;

  -- 2. Create Tenant
  INSERT INTO tenants (name, org_type, subscription_status)
  VALUES (p_org_name, p_org_type, 'active')
  RETURNING id INTO v_tenant_id;

  -- 3. Update Organisation
  UPDATE organisations SET tenant_id = v_tenant_id WHERE id = p_org_id;

  -- 4. Update Profile (Trigger already created it for the user)
  INSERT INTO public.profiles (id, full_name, role, tenant_id, is_superadmin)
  VALUES (p_user_id, p_org_name || ' Admin', 'admin', v_tenant_id, false)
  ON CONFLICT (id) DO UPDATE 
  SET role = 'admin', tenant_id = v_tenant_id, full_name = EXCLUDED.full_name;

  RETURN jsonb_build_object('success', true, 'tenant_id', v_tenant_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
