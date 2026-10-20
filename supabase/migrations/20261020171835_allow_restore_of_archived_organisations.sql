-- Allow tenant admins to restore an archived descendant when its immediate
-- parent is still visible to them. Active visibility intentionally excludes
-- archived rows, so the archived target itself cannot be the visibility proof.
-- All existing auth, enabled-tenant, hierarchy, and self-target checks remain.

CREATE OR REPLACE FUNCTION public._assert_organisation_hierarchy_access(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_archived_target_under_visible_parent boolean := false;
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

  IF public.get_my_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Permission denied: tenant access required';
  END IF;

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

  SELECT EXISTS (
    SELECT 1
    FROM public.organisations target_org
    WHERE target_org.id = p_org_id
      AND target_org.archived_at IS NOT NULL
      AND target_org.parent_id IS NOT NULL
      AND public.is_org_visible(target_org.parent_id)
  ) INTO v_archived_target_under_visible_parent;

  IF NOT (
    (public.is_org_visible(p_org_id) OR v_archived_target_under_visible_parent)
    AND p_org_id <> public.get_my_org_id()
  ) THEN
    RAISE EXCEPTION 'Permission denied: target organisation is not within your hierarchy';
  END IF;
END;
$$;

-- Keep the helper internal; existing function ACLs are retained by CREATE OR REPLACE.
REVOKE ALL ON FUNCTION public._assert_organisation_hierarchy_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_organisation_hierarchy_access(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._assert_organisation_hierarchy_access(uuid) FROM authenticated;
