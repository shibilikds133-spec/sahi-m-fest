-- Migration 122: Safe RPC to finalise team leader provisioning
-- Called exclusively by the Edge Function to setup the DB linkage securely.

CREATE OR REPLACE FUNCTION public.finalise_team_leader_provisioning(
  p_participant_id uuid,
  p_user_id uuid,
  p_email text,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_participant public.participants;
  v_org_visible boolean;
  v_existing_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Load Participant and verify existence
  SELECT * INTO v_participant
  FROM public.participants
  WHERE id = p_participant_id;

  IF v_participant.id IS NULL THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  -- 2. Authorize caller via canonical visibility rules
  v_org_visible := public.is_org_visible(v_participant.organisation_id);
  
  -- If not visible via org hierarchy, fallback to strict tenant match (e.g. root tenant)
  IF NOT v_org_visible AND public.get_my_tenant_id() IS DISTINCT FROM v_participant.tenant_id THEN
    RAISE EXCEPTION 'Unauthorized: Caller does not have management access to this participant';
  END IF;

  -- 3. Check for existing Auth user / Profile
  SELECT * INTO v_existing_profile
  FROM public.profiles
  WHERE id = p_user_id;

  -- If the profile exists (i.e. existing Auth user reuse)
  IF v_existing_profile.id IS NOT NULL THEN
    -- Prevent role corruption!
    IF v_existing_profile.role IN ('admin', 'superadmin', 'judge') THEN
      RAISE EXCEPTION 'Role Conflict: The associated account is an Admin/Judge. Create a separate account for Team Leader duties.';
    END IF;
    
    -- If it's a participant, we can upgrade them to team_leader.
    -- If they are already a team_leader, that's perfect.
    IF v_existing_profile.role = 'participant' THEN
      UPDATE public.profiles
      SET role = 'team_leader'
      WHERE id = p_user_id;
    END IF;
  ELSE
    -- 4. Profile doesn't exist, this is a newly created Auth user. Create Profile.
    INSERT INTO public.profiles (
      id,
      tenant_id,
      role,
      full_name
    ) VALUES (
      p_user_id,
      v_participant.tenant_id,
      'team_leader',
      v_participant.name
    );
  END IF;

  -- 5. Canonical Participant Linkage
  -- This sets the newly created or reused Auth User ID to the participant row.
  -- The unique constraint idx_participants_festival_user will automatically reject
  -- if the user is already linked to another participant in the SAME festival.
  UPDATE public.participants
  SET user_id = p_user_id
  WHERE id = p_participant_id;

  RETURN jsonb_build_object(
    'success', true,
    'participant_id', p_participant_id,
    'user_id', p_user_id
  );
END;
$$;
