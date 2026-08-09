-- Migration 120: Fix Infinite Recursion in festival_teams policies
-- Breaks the dependency loop between festival_teams and team_leader_assignments
-- by using a SECURITY DEFINER function to check the team's tenant.

-- 1. Create a helper function that bypasses RLS to check team admin rights
CREATE OR REPLACE FUNCTION public.check_festival_team_admin(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.festival_teams 
    WHERE id = p_team_id 
    AND parent_tenant_id = public.get_my_tenant_id()
  );
$$;

-- 2. Replace the conflicting policy on team_leader_assignments
DROP POLICY IF EXISTS team_leader_assignments_admin_manage ON public.team_leader_assignments;

CREATE POLICY team_leader_assignments_admin_manage ON public.team_leader_assignments
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR public.check_festival_team_admin(festival_team_id))
  WITH CHECK (public.is_superadmin() OR public.check_festival_team_admin(festival_team_id));

-- 3. Reload schema cache
NOTIFY pgrst, 'reload schema';
