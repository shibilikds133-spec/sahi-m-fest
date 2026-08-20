-- ============================================================
-- Migration 014: Fix RLS to allow viewing child organisations
-- Allows admins to see orgs that are direct children of their own org
-- ============================================================

-- Drop old restrictive policy
DROP POLICY IF EXISTS "Admins can see their own organisation" ON organisations;
DROP POLICY IF EXISTS "Superadmins can see all organisations" ON organisations;

-- Create a helper function to get the current user's org ID
CREATE OR REPLACE FUNCTION public.get_my_org_id() RETURNS uuid AS $$
  SELECT id FROM public.organisations WHERE tenant_id = public.get_my_tenant_id() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- New policy: Admins can see their own org AND all direct children
CREATE POLICY "Admins can see own and child organisations" 
ON organisations FOR SELECT TO authenticated 
USING (
  -- Their own org
  tenant_id = public.get_my_tenant_id()
  -- OR child org of their org
  OR parent_id = public.get_my_org_id()
  -- OR superadmin
  OR public.is_superadmin()
);

-- Superadmin full control stays
CREATE POLICY "Superadmins full control organisations" 
ON organisations FOR ALL TO authenticated 
USING (public.is_superadmin());

NOTIFY pgrst, 'reload schema';
