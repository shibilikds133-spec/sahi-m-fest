-- Fix 42501 permission denied for function is_team_leader
--
-- Root cause: Migration 118 created RESTRICTIVE policies on 16 core tables
-- that call public.is_team_leader(), but simultaneously REVOKE'd EXECUTE on
-- that function from the authenticated role. When ANY authenticated user
-- queries ANY of these 16 tables via PostgREST, PostgreSQL evaluates the
-- RESTRICTIVE policy, tries to call is_team_leader(), and fails with
-- "permission denied for function is_team_leader" (42501).
--
-- This breaks login (profiles query), admin operations, and all core flows.
--
-- Fix: Restore EXECUTE permission on is_team_leader() for authenticated.
-- The function is safe (returns boolean, SECURITY DEFINER, no side effects).
-- The RESTRICTIVE policies still block team_leader role from direct access
-- because is_team_leader() returns TRUE for team leaders, making
-- NOT is_team_leader() evaluate to FALSE.

BEGIN;

-- 1. Restore EXECUTE on is_team_leader() for authenticated.
--    This is required because the function is called by RESTRICTIVE policies
--    that apply to the authenticated role. Without EXECUTE, the policy
--    evaluation fails with 42501 instead of returning FALSE.
GRANT EXECUTE ON FUNCTION public.is_team_leader() TO authenticated;

-- 2. Add permissive SELECT on schedules for authenticated.
--    The schedules table previously had NO RLS. Migration 118 enabled RLS
--    with only a RESTRICTIVE deny policy. Without a permissive policy,
--    ALL authenticated direct queries to schedules are blocked, breaking
--    admin schedule management, public leaderboard, and import flows.
CREATE POLICY authenticated_read_schedules ON public.schedules
  FOR SELECT TO authenticated
  USING (true);

-- 3. Add permissive SELECT on venues for authenticated.
--    Same regression as schedules: previously had no RLS, now only has
--    a RESTRICTIVE deny. Admin venue lookups and schedule imports break.
CREATE POLICY authenticated_read_venues ON public.venues
  FOR SELECT TO authenticated
  USING (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
