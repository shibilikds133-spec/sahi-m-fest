-- Secure tenant-admin account status lookup for the assignment form.
CREATE OR REPLACE FUNCTION public.get_team_leader_participant_account(p_participant_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  role text,
  team_leader_code text,
  team_leader_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_caller public.profiles;
  v_participant public.participants;
BEGIN
  SELECT * INTO v_caller
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller.id IS NULL
     OR (v_caller.role IS DISTINCT FROM 'admin' AND v_caller.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an authorized administrator may view Team Leader account status.';
  END IF;

  SELECT * INTO v_participant
  FROM public.participants
  WHERE id = p_participant_id;

  IF v_participant.id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR public.is_org_visible(v_participant.organisation_id)
    OR public.get_my_tenant_id() IS NOT DISTINCT FROM v_participant.tenant_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: participant is outside the current tenant hierarchy.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role, p.team_leader_code, p.team_leader_email
  FROM public.profiles p
  WHERE p.id = v_participant.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_participant_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_participant_account(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
