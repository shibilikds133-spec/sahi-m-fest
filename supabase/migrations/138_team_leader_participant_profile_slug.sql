-- Expose only the public profile slug needed for Team Leader profile navigation.
-- No private participant fields are added to this RPC.

DROP FUNCTION IF EXISTS public.get_team_leader_participants();

CREATE FUNCTION public.get_team_leader_participants()
RETURNS TABLE (
  id uuid,
  name text,
  gender text,
  category_code text,
  chest_number text,
  status text,
  festival_id uuid,
  organisation_id uuid,
  profile_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p.id, p.name, p.gender, p.category_code, p.chest_number,
         p.status, p.festival_id, p.organisation_id, p.profile_slug
  FROM public.participants p
  JOIN public.get_team_leader_context() c
    ON c.festival_id = p.festival_id
   AND c.organisation_id = p.organisation_id;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_participants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_participants() TO authenticated;

NOTIFY pgrst, 'reload schema';
