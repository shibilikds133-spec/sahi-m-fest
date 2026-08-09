-- Additive Team Leader context/details hardening.
-- The original foundation functions remain unchanged.

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
    AND COALESCE(s.is_enabled, false)
    AND (s.opens_at IS NULL OR s.opens_at <= now())
    AND (s.closes_at IS NULL OR s.closes_at > now())
  ORDER BY a.assigned_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_context_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_context_details() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_team_leader_standings()
RETURNS TABLE (
  rank bigint,
  organisation_id uuid,
  team_name text,
  total_points bigint,
  is_own_team boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH ctx AS (SELECT * FROM public.get_team_leader_context()),
  official AS (
    SELECT * FROM public.get_public_leaderboard(
      (SELECT parent_tenant_id FROM ctx),
      (SELECT festival_id FROM ctx)
    )
  ),
  teams AS (
    SELECT ft.organisation_id, o.name
    FROM public.festival_teams ft
    JOIN public.organisations o ON o.id = ft.organisation_id
    JOIN ctx ON ctx.festival_id = ft.festival_id
           AND ctx.parent_tenant_id = ft.parent_tenant_id
    WHERE ft.is_active
  )
  SELECT DENSE_RANK() OVER (
           ORDER BY COALESCE(official.total_points, 0) DESC,
                    COALESCE(official.first_place_count, 0) DESC,
                    COALESCE(official.second_place_count, 0) DESC,
                    teams.name ASC
         ),
         teams.organisation_id,
         teams.name,
         COALESCE(official.total_points, 0)::bigint,
         (teams.organisation_id = (SELECT organisation_id FROM ctx))
  FROM teams
  LEFT JOIN official ON official.organisation_id = teams.organisation_id
  ORDER BY 1, teams.name;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_standings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_standings() TO authenticated;

NOTIFY pgrst, 'reload schema';
