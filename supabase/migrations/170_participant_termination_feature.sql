-- 170_participant_termination_feature.sql
-- Adds safe termination capabilities for participants, preserving org points but hiding from individual leaderboards.

BEGIN;

-- 1. Add termination fields to participants table
ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS is_terminated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS termination_reason TEXT;

-- 2. Create RPC to terminate a participant
CREATE OR REPLACE FUNCTION public.terminate_participant(
  p_participant_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is an admin
  IF NOT (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('tenant_admin', 'festival_admin', 'admin')
  )) THEN
    RAISE EXCEPTION 'Only administrators can terminate participants.';
  END IF;

  UPDATE public.participants
  SET is_terminated = true,
      termination_reason = p_reason,
      updated_at = now()
  WHERE id = p_participant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.terminate_participant(UUID, TEXT) TO authenticated;

-- 3. Create RPC to revoke termination
CREATE OR REPLACE FUNCTION public.revoke_termination(
  p_participant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller is an admin
  IF NOT (public.is_superadmin() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('tenant_admin', 'festival_admin', 'admin')
  )) THEN
    RAISE EXCEPTION 'Only administrators can revoke participant termination.';
  END IF;

  UPDATE public.participants
  SET is_terminated = false,
      termination_reason = NULL,
      updated_at = now()
  WHERE id = p_participant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_termination(UUID) TO authenticated;

-- 4. Update vw_public_results to exclude terminated participants from individual leaderboards
-- We keep the row so the organisation keeps points, but nullify the participant details.
CREATE OR REPLACE VIEW public.vw_public_results AS
SELECT
  res.id AS result_id,
  res.registration_id,
  res.item_id,
  COALESCE(itm.item_name_en, '') AS item_name,
  COALESCE(itm.item_name_ml, '') AS item_name_ml,
  COALESCE(itm.participation_type = 'group', false) AS is_group,
  COALESCE(itm.category_codes, ARRAY[]::text[]) AS item_category_codes,
  org.id AS organisation_id,
  COALESCE(org.name, 'Unassigned') AS organisation_name,
  org.org_type AS organisation_type,
  -- Hide participant ID if terminated so they don't accrue individual points
  CASE WHEN COALESCE(participant.is_terminated, false) THEN NULL ELSE participant.id END AS participant_id,
  CASE WHEN COALESCE(participant.is_terminated, false) THEN '[Terminated]' ELSE COALESCE(participant.name, '') END AS participant_name,
  CASE WHEN COALESCE(participant.is_terminated, false) THEN '' ELSE COALESCE(participant.chest_number, '') END AS chest_number,
  participant.category_code AS participant_category_code,
  res.rank,
  res.grade,
  res.points_awarded,
  res.published_at,
  res.festival_id
FROM results res
LEFT JOIN registrations reg ON reg.id = res.registration_id
LEFT JOIN items itm ON itm.id = res.item_id
LEFT JOIN participants participant ON participant.id = reg.participant_id
LEFT JOIN organisations org ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
WHERE res.published IS TRUE
  AND res.public_visible IS TRUE
  AND COALESCE(res.result_status, 'published') = 'published';

GRANT SELECT ON public.vw_public_results TO anon, authenticated;

-- 5. Update vw_public_participants to completely hide terminated participants
CREATE OR REPLACE VIEW public.vw_public_participants AS
SELECT
  p.id AS participant_id,
  p.festival_id,
  p.name AS participant_name,
  p.chest_number,
  p.profile_slug,
  itm.item_code,
  itm.item_name_en AS item_name,
  itm.item_name_ml AS item_name_ml,
  CASE WHEN res.published IS TRUE AND res.public_visible IS TRUE THEN res.rank ELSE NULL END AS rank,
  CASE WHEN res.published IS TRUE AND res.public_visible IS TRUE THEN res.grade ELSE NULL END AS grade,
  CASE WHEN res.published IS TRUE AND res.public_visible IS TRUE THEN res.points_awarded ELSE 0 END AS points_awarded
FROM participants p
LEFT JOIN registrations reg ON reg.participant_id = p.id AND reg.status IS DISTINCT FROM 'rejected'
LEFT JOIN items itm ON itm.id = reg.item_id
LEFT JOIN results res ON res.registration_id = reg.id
WHERE p.status = 'approved'
  AND COALESCE(p.is_terminated, false) = false;

GRANT SELECT ON public.vw_public_participants TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
