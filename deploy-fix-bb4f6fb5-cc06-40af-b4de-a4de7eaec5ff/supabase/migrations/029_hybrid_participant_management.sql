-- ============================================================
-- Migration 028: Hybrid Participant Management
-- Supports multi-level organization hierarchies (Sector -> Unit)
-- ============================================================

-- 1. Link tenants to their organisation node
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- 2. Backfill existing tenants based on organisation tenant_id
-- We find organisations where tenant_id matches the tenant, and link them.
UPDATE tenants t
SET organisation_id = o.id
FROM organisations o
WHERE o.tenant_id = t.id
AND t.organisation_id IS NULL;

-- 3. Create RPC to recursively find all visible organisations
CREATE OR REPLACE FUNCTION public.get_visible_organisations(p_tenant_id uuid)
RETURNS TABLE (id uuid, name text, org_type text, parent_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE org_tree AS (
    -- Anchor: orgs directly owned by this tenant OR where the tenant is linked to this org
    SELECT o.id, o.name, o.org_type, o.parent_id, o.tenant_id
    FROM organisations o
    LEFT JOIN tenants t ON t.id = p_tenant_id
    WHERE o.tenant_id = p_tenant_id OR o.id = t.organisation_id

    UNION ALL

    -- Walk DOWN: children of any org in the tree
    SELECT child.id, child.name, child.org_type, child.parent_id, child.tenant_id
    FROM organisations child
    INNER JOIN org_tree parent ON child.parent_id = parent.id
  )
  SELECT DISTINCT * FROM org_tree ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_organisations(uuid) TO authenticated;

-- 4. Create RPC helper for RLS policies
CREATE OR REPLACE FUNCTION public.is_org_visible(p_org_id uuid) 
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.get_visible_organisations(public.get_my_tenant_id())
    WHERE id = p_org_id
  );
$$;

-- 5. Update setup_child_organisation to link the tenant to the organisation
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
  
  -- 3.b Update the tenant to link it to the organisation
  UPDATE tenants SET organisation_id = v_new_org_id WHERE id = v_new_tenant_id;

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

-- 6. Update RLS policies for Participants to use is_org_visible
DROP POLICY IF EXISTS "participants_select_policy" ON participants;
DROP POLICY IF EXISTS "participants_insert_policy" ON participants;
DROP POLICY IF EXISTS "participants_update_policy" ON participants;
DROP POLICY IF EXISTS "participants_delete_policy" ON participants;

CREATE POLICY "participants_select_policy"
ON participants FOR SELECT TO authenticated
USING (public.is_org_visible(organisation_id) OR public.is_superadmin());

CREATE POLICY "participants_insert_policy"
ON participants FOR INSERT TO authenticated
WITH CHECK (public.is_org_visible(organisation_id) OR public.is_superadmin());

CREATE POLICY "participants_update_policy"
ON participants FOR UPDATE TO authenticated
USING (public.is_org_visible(organisation_id) OR public.is_superadmin())
WITH CHECK (public.is_org_visible(organisation_id) OR public.is_superadmin());

CREATE POLICY "participants_delete_policy"
ON participants FOR DELETE TO authenticated
USING (public.is_org_visible(organisation_id) OR public.is_superadmin());

-- 7. Update RLS policies for Registrations to use is_org_visible
DROP POLICY IF EXISTS "registrations_select_policy" ON registrations;
DROP POLICY IF EXISTS "registrations_insert_policy" ON registrations;
DROP POLICY IF EXISTS "registrations_update_policy" ON registrations;
DROP POLICY IF EXISTS "registrations_delete_policy" ON registrations;

CREATE POLICY "registrations_select_policy"
ON registrations FOR SELECT TO authenticated
USING (public.is_org_visible(organisation_id) OR public.is_superadmin());

CREATE POLICY "registrations_insert_policy"
ON registrations FOR INSERT TO authenticated
WITH CHECK (public.is_org_visible(organisation_id) OR public.is_superadmin());

CREATE POLICY "registrations_update_policy"
ON registrations FOR UPDATE TO authenticated
USING (public.is_org_visible(organisation_id) OR public.is_superadmin())
WITH CHECK (public.is_org_visible(organisation_id) OR public.is_superadmin());

CREATE POLICY "registrations_delete_policy"
ON registrations FOR DELETE TO authenticated
USING (public.is_org_visible(organisation_id) OR public.is_superadmin());

-- Reload schema
NOTIFY pgrst, 'reload schema';
