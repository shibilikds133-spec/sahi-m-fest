-- Participant Team Transfer RPC
-- Safely transfers a participant to a new organisation, moving their solo items.

CREATE OR REPLACE FUNCTION public.transfer_participant_team(
  p_participant_id uuid,
  p_new_org_id uuid,
  p_admin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant RECORD;
  v_old_org_id uuid;
  v_duplicate_exists boolean;
BEGIN
  -- 1. Fetch current participant details
  SELECT * INTO v_participant FROM public.participants WHERE id = p_participant_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  v_old_org_id := v_participant.organisation_id;

  -- If the org is the same, do nothing
  IF v_old_org_id = p_new_org_id THEN
    RETURN;
  END IF;

  -- 2. Check for duplicate name in the new organisation
  SELECT EXISTS (
    SELECT 1 FROM public.participants 
    WHERE organisation_id = p_new_org_id 
      AND lower(trim(name)) = lower(trim(v_participant.name))
  ) INTO v_duplicate_exists;

  IF v_duplicate_exists THEN
    RAISE EXCEPTION 'A participant with this exact name already exists in the selected unit.';
  END IF;

  -- 3. Update Participant's Unit
  UPDATE public.participants 
  SET organisation_id = p_new_org_id,
      updated_at = now()
  WHERE id = p_participant_id;

  -- 4. Update Solo Registrations to the new Unit
  -- This ensures points for these items go to the new unit.
  UPDATE public.registrations
  SET organisation_id = p_new_org_id
  WHERE participant_id = p_participant_id
    AND (is_group_registration = false OR is_group_registration IS NULL);

  -- 5. Audit Log (Record the transfer)
  INSERT INTO public.participant_unit_audit_logs (
    participant_id,
    old_unit_id,
    new_unit_id,
    changed_by,
    reason,
    changed_at
  ) VALUES (
    p_participant_id,
    v_old_org_id,
    p_new_org_id,
    p_admin_id,
    'Surgical Team Transfer via Admin Panel',
    now()
  );

END;
$$;
