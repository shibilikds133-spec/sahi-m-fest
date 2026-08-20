-- Keep Team Leader access scoped to a valid active assignment while treating
-- an absent portal-settings row as the default enabled state. An explicitly
-- configured disabled/windowed row still controls access.

CREATE OR REPLACE FUNCTION public.get_team_leader_context()
RETURNS TABLE (
  assignment_id uuid,
  parent_tenant_id uuid,
  festival_id uuid,
  festival_team_id uuid,
  organisation_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT a.id, ft.parent_tenant_id, ft.festival_id, ft.id, ft.organisation_id
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.festival_calendar f ON f.id = ft.festival_id
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.team_portal_settings s
    ON s.parent_tenant_id = ft.parent_tenant_id AND s.festival_id = ft.festival_id
  WHERE a.user_id = auth.uid()
    AND p.role = 'team_leader'
    AND a.status = 'active'
    AND a.revoked_at IS NULL
    AND a.valid_from <= now()
    AND (a.valid_until IS NULL OR a.valid_until > now())
    AND ft.is_active
    AND f.is_active
    AND COALESCE(s.is_enabled, true)
    AND (s.opens_at IS NULL OR s.opens_at <= now())
    AND (s.closes_at IS NULL OR s.closes_at > now())
  ORDER BY a.assigned_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_leader_context_details()
RETURNS TABLE (
  assignment_id uuid,
  parent_tenant_id uuid,
  festival_id uuid,
  festival_team_id uuid,
  organisation_id uuid,
  team_name text,
  festival_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT a.id,
         ft.parent_tenant_id,
         ft.festival_id,
         ft.id,
         ft.organisation_id,
         o.name,
         COALESCE(f.custom_name, 'Festival ' || f.festival_year::text)
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.organisations o ON o.id = ft.organisation_id
  JOIN public.festival_calendar f ON f.id = ft.festival_id
  JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.team_portal_settings s
    ON s.parent_tenant_id = ft.parent_tenant_id AND s.festival_id = ft.festival_id
  WHERE a.user_id = auth.uid()
    AND p.role = 'team_leader'
    AND a.status = 'active'
    AND a.revoked_at IS NULL
    AND a.valid_from <= now()
    AND (a.valid_until IS NULL OR a.valid_until > now())
    AND ft.is_active
    AND f.is_active
    AND COALESCE(s.is_enabled, true)
    AND (s.opens_at IS NULL OR s.opens_at <= now())
    AND (s.closes_at IS NULL OR s.closes_at > now())
  ORDER BY a.assigned_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_context_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_context_details() TO authenticated;

NOTIFY pgrst, 'reload schema';
