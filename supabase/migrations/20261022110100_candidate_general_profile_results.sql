-- Include published General team placements on each listed team member's
-- Candidate Profile, while keeping team points out of participant profiles.
CREATE OR REPLACE FUNCTION public.get_public_candidate_profile(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_participant record;
  v_result jsonb;
BEGIN
  SELECT
    p.id,
    p.profile_slug,
    p.name,
    p.photo_url,
    p.category_code,
    p.profile_bio,
    p.public_profile_enabled,
    p.show_organisation_public,
    org.name AS organisation_name,
    org.org_type AS organisation_type
  INTO v_participant
  FROM public.participants p
  LEFT JOIN public.organisations org ON org.id = p.organisation_id
  WHERE p.profile_slug = p_slug
    AND COALESCE(p.public_profile_enabled, true) IS TRUE
  LIMIT 1;

  IF v_participant.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_participant.id,
      'slug', v_participant.profile_slug,
      'name', v_participant.name,
      'photo_url', v_participant.photo_url,
      'category_code', v_participant.category_code,
      'bio', COALESCE(v_participant.profile_bio, ''),
      'organisation_name', CASE WHEN COALESCE(v_participant.show_organisation_public, true) THEN v_participant.organisation_name ELSE NULL END,
      'organisation_type', CASE WHEN COALESCE(v_participant.show_organisation_public, true) THEN v_participant.organisation_type ELSE NULL END
    ),
    'participated_items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'registration_id', reg.id,
          'entry_kind', reg.entry_kind,
          'entry_chest_number', reg.entry_chest_number,
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'category_codes', COALESCE(itm.category_codes, ARRAY[]::text[]),
          'participation_type', COALESCE(itm.participation_type, 'individual'),
          'status', COALESCE(reg.status, 'registered')
        )
        ORDER BY COALESCE(itm.item_name_ml, itm.item_name_en, '')
      )
      FROM public.registrations reg
      LEFT JOIN public.items itm ON itm.id = reg.item_id
      WHERE (reg.participant_id = v_participant.id OR (
          reg.entry_kind = 'general_team' AND reg.participant_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.group_members gm
            JOIN public.participants member ON member.id = gm.participant_id
            WHERE gm.registration_id = reg.id
              AND gm.participant_id = v_participant.id
              AND member.festival_id = reg.festival_id
          )
        ))
        AND reg.status IS DISTINCT FROM 'rejected'
    ), '[]'::jsonb),
    'published_results', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'result_id', res.id,
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'entry_kind', COALESCE(reg.entry_kind, 'participant'),
          'rank', res.rank,
          'grade', res.grade,
          'points_awarded', CASE
            WHEN reg.entry_kind = 'general_team' THEN 0
            ELSE COALESCE(res.points_awarded, 0)
          END,
          'published_at', res.published_at
        )
        ORDER BY res.rank NULLS LAST, res.published_at DESC NULLS LAST
      )
      FROM public.results res
      JOIN public.registrations reg ON reg.id = res.registration_id
      LEFT JOIN public.items itm ON itm.id = res.item_id
      WHERE (
          reg.participant_id = v_participant.id OR (
            reg.entry_kind = 'general_team'
            AND reg.participant_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.group_members gm
              JOIN public.participants member ON member.id = gm.participant_id
              WHERE gm.registration_id = reg.id
                AND gm.participant_id = v_participant.id
                AND member.festival_id = reg.festival_id
            )
          )
        )
        AND res.published IS TRUE
        AND COALESCE(res.result_status, 'draft') = 'published'
        AND COALESCE(res.public_visible, false) IS TRUE
        AND reg.status IS DISTINCT FROM 'rejected'
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_candidate_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_candidate_profile(text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
