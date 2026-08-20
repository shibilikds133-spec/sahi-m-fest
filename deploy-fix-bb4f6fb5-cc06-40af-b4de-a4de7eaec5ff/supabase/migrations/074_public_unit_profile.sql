-- Migration 073: Public Unit Profile RPC
-- Bypasses RLS to safely return public data for a unit profile page

CREATE OR REPLACE FUNCTION public.get_public_unit_profile(p_unit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
  v_result jsonb;
BEGIN
  -- Fetch organisation details
  SELECT
    id, name, parent_id
  INTO v_org
  FROM organisations
  WHERE id = p_unit_id
  LIMIT 1;

  IF v_org.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build JSON
  SELECT jsonb_build_object(
    'id', v_org.id,
    'name', v_org.name,
    'parent_id', v_org.parent_id,
    'participants', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'chest_number', p.chest_number,
          'category_code', p.category_code,
          'profile_slug', p.profile_slug,
          'status', p.status,
          'photo_url', p.photo_url,
          'registrations', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', r.id,
                'status', r.status,
                'item_id', r.item_id,
                'item', jsonb_build_object(
                  'name', i.item_name_en,
                  'name_ml', i.item_name_ml
                ),
                'results', COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'rank', res.rank,
                      'grade', res.grade,
                      'points_awarded', res.points_awarded
                    )
                  )
                  FROM results res
                  WHERE res.registration_id = r.id
                    AND res.published IS TRUE
                    AND COALESCE(res.public_visible, false) IS TRUE
                ), '[]'::jsonb)
              )
            )
            FROM registrations r
            LEFT JOIN items i ON i.id = r.item_id
            WHERE r.participant_id = p.id
          ), '[]'::jsonb)
        )
      )
      FROM participants p
      WHERE p.organisation_id = v_org.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_unit_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
