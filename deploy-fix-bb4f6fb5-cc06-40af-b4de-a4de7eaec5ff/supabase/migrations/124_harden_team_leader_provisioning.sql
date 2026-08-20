-- Harden the already-applied Team Leader provisioning RPC.
-- Additive follow-up to migrations 121/122; no existing rows are changed.

CREATE OR REPLACE FUNCTION public.finalise_team_leader_provisioning(
  p_participant_id uuid,
  p_user_id uuid,
  p_email text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_participant public.participants;
  v_existing_profile public.profiles;
  v_caller_profile public.profiles;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_caller_profile
  FROM public.profiles
  WHERE id = v_caller;

  IF v_caller_profile.id IS NULL
     OR (v_caller_profile.role IS DISTINCT FROM 'admin' AND v_caller_profile.is_superadmin IS NOT TRUE) THEN
    RAISE EXCEPTION 'Only an authorized administrator may provision Team Leader accounts.';
  END IF;

  IF p_participant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Participant and user are required.';
  END IF;

  SELECT * INTO v_participant
  FROM public.participants
  WHERE id = p_participant_id;

  IF v_participant.id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  IF v_participant.user_id IS NOT NULL AND v_participant.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Participant already has a linked account.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR public.is_org_visible(v_participant.organisation_id)
    OR public.get_my_tenant_id() IS NOT DISTINCT FROM v_participant.tenant_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Caller does not have management access to this participant';
  END IF;

  SELECT * INTO v_existing_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_existing_profile.id IS NOT NULL THEN
    IF v_existing_profile.role NOT IN ('participant', 'team_leader') THEN
      RAISE EXCEPTION 'Role Conflict: The associated account cannot be converted to Team Leader.';
    END IF;
    IF v_existing_profile.role = 'participant' THEN
      UPDATE public.profiles
      SET role = 'team_leader'
      WHERE id = p_user_id;
    END IF;
  ELSE
    INSERT INTO public.profiles (id, tenant_id, role, full_name)
    VALUES (p_user_id, v_participant.tenant_id, 'team_leader', v_participant.name);
  END IF;

  UPDATE public.participants
  SET user_id = p_user_id
  WHERE id = p_participant_id
    AND (user_id IS NULL OR user_id = p_user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant link could not be completed.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'participant_id', p_participant_id,
    'user_id', p_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalise_team_leader_provisioning(uuid, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalise_team_leader_provisioning(uuid, uuid, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
