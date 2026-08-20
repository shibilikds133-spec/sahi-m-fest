-- Narrow fallback for portal login profile resolution when profile SELECT RLS
-- is unavailable in a freshly-issued Auth session.
CREATE OR REPLACE FUNCTION public.get_my_login_profile()
RETURNS TABLE (
  role text,
  tenant_id uuid,
  is_superadmin boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p.role, p.tenant_id, p.is_superadmin
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_login_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_login_profile() TO authenticated;
