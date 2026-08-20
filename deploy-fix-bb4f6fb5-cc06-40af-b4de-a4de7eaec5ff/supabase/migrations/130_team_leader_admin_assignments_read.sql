-- Secure read contract for tenant-admin Team Leader assignment management.
-- This avoids exposing profiles through a broad client-side query while
-- preserving the existing organisation visibility rules.
CREATE OR REPLACE FUNCTION public.get_team_leader_assignments_for_admin(p_festival_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  festival_team_id uuid,
  organisation_id uuid,
  status text,
  assigned_at timestamptz,
  created_at timestamptz,
  team_name text,
  leader_email text,
  leader_code text,
  leader_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_caller public.profiles;
BEGIN
  SELECT * INTO v_caller
  FROM public.profiles
  WHERE profiles.id = auth.uid();

  IF v_caller.id IS NULL
     OR (v_caller.role IS DISTINCT FROM 'admin' AND v_caller.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an authorized administrator may view Team Leader assignments.';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.user_id,
    a.festival_team_id,
    ft.organisation_id,
    a.status,
    a.assigned_at,
    a.created_at,
    o.name,
    p.team_leader_email,
    p.team_leader_code,
    p.full_name
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.organisations o ON o.id = ft.organisation_id
  LEFT JOIN public.profiles p ON p.id = a.user_id
  WHERE a.status = 'active'
    AND ft.is_active = true
    AND ft.festival_id = p_festival_id
    AND (
      public.is_superadmin()
      OR public.is_org_visible(ft.organisation_id)
      OR ft.parent_tenant_id IS NOT DISTINCT FROM public.get_my_tenant_id()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_assignments_for_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_assignments_for_admin(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
