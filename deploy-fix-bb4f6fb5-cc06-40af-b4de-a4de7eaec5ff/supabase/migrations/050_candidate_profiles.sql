-- Core participant-owned candidate profiles with a public-safe projection RPC.
-- This extends participants; it does not expose raw participant rows publicly.

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS profile_slug text,
  ADD COLUMN IF NOT EXISTS profile_bio text,
  ADD COLUMN IF NOT EXISTS profile_photo_object_key text,
  ADD COLUMN IF NOT EXISTS public_profile_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_organisation_public boolean DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_profile_slug
  ON public.participants(profile_slug)
  WHERE profile_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.slugify_candidate_name(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    trim(both '-' from regexp_replace(lower(coalesce(value, 'candidate')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_candidate_profile_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  suffix text;
BEGIN
  suffix := left(NEW.id::text, 8);

  IF NEW.profile_slug IS NULL OR trim(NEW.profile_slug) = '' THEN
    base_slug := COALESCE(public.slugify_candidate_name(NEW.name), 'candidate');
  ELSE
    base_slug := COALESCE(public.slugify_candidate_name(NEW.profile_slug), 'candidate');
  END IF;

  base_slug := regexp_replace(base_slug, '-' || suffix || '$', '');
  NEW.profile_slug := base_slug || '-' || suffix;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidate_profile_slug ON public.participants;
CREATE TRIGGER trg_candidate_profile_slug
  BEFORE INSERT OR UPDATE OF name, profile_slug
  ON public.participants
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_candidate_profile_slug();

UPDATE public.participants
SET profile_slug = COALESCE(public.slugify_candidate_name(name), 'candidate') || '-' || left(id::text, 8)
WHERE profile_slug IS NULL OR trim(profile_slug) = '';

CREATE OR REPLACE FUNCTION public.get_public_candidate_profile(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
  FROM participants p
  LEFT JOIN organisations org ON org.id = p.organisation_id
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
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'category_codes', COALESCE(itm.category_codes, ARRAY[]::text[]),
          'participation_type', COALESCE(itm.participation_type, 'individual'),
          'status', COALESCE(reg.status, 'registered')
        )
        ORDER BY COALESCE(itm.item_name_ml, itm.item_name_en, '')
      )
      FROM registrations reg
      LEFT JOIN items itm ON itm.id = reg.item_id
      WHERE reg.participant_id = v_participant.id
    ), '[]'::jsonb),
    'published_results', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'result_id', res.id,
          'item_id', itm.id,
          'item_name', COALESCE(itm.item_name_en, ''),
          'item_name_ml', COALESCE(itm.item_name_ml, ''),
          'rank', res.rank,
          'grade', res.grade,
          'points_awarded', COALESCE(res.points_awarded, 0),
          'published_at', res.published_at
        )
        ORDER BY res.rank NULLS LAST, res.published_at DESC NULLS LAST
      )
      FROM results res
      LEFT JOIN registrations reg ON reg.id = res.registration_id
      LEFT JOIN items itm ON itm.id = res.item_id
      WHERE reg.participant_id = v_participant.id
        AND res.published IS TRUE
        AND COALESCE(res.result_status, 'draft') = 'published'
        AND COALESCE(res.public_visible, false) IS TRUE
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_candidate_profile(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_public_published_results(uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.get_public_published_results(
  p_tenant_id uuid DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL,
  p_include_participant_details boolean DEFAULT true
)
RETURNS TABLE (
  result_id uuid,
  registration_id uuid,
  item_id uuid,
  item_name text,
  item_name_ml text,
  is_group boolean,
  item_category_codes text[],
  organisation_id uuid,
  organisation_name text,
  organisation_type text,
  participant_id uuid,
  participant_name text,
  participant_profile_slug text,
  chest_number text,
  participant_category_code text,
  rank integer,
  grade text,
  points_awarded integer,
  published_at timestamptz,
  festival_level text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_festival_id uuid;
  v_festival_tenant_id uuid;
  v_festival_level text;
  v_is_public_visible boolean := false;
BEGIN
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC, start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  SELECT tenant_id, level
  INTO v_festival_tenant_id, v_festival_level
  FROM festival_calendar
  WHERE id = v_festival_id;

  SELECT COALESCE(is_public_visible, false)
  INTO v_is_public_visible
  FROM festival_leaderboard_settings
  WHERE festival_id = v_festival_id
  LIMIT 1;

  IF v_is_public_visible IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH published_results AS (
    SELECT DISTINCT ON (COALESCE(res.registration_id, res.id), res.item_id)
      res.id,
      res.registration_id,
      res.item_id,
      res.rank,
      res.grade,
      COALESCE(res.points_awarded, 0) AS points_awarded,
      res.published_at,
      res.festival_id
    FROM results res
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') = 'published'
      AND COALESCE(res.public_visible, false) IS TRUE
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
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
    CASE WHEN p_include_participant_details THEN participant.id ELSE NULL END AS participant_id,
    CASE WHEN p_include_participant_details THEN COALESCE(participant.name, '') ELSE '' END AS participant_name,
    CASE WHEN p_include_participant_details AND COALESCE(participant.public_profile_enabled, true) THEN participant.profile_slug ELSE NULL END AS participant_profile_slug,
    CASE WHEN p_include_participant_details THEN COALESCE(participant.chest_number, '') ELSE '' END AS chest_number,
    CASE WHEN p_include_participant_details THEN participant.category_code ELSE NULL END AS participant_category_code,
    res.rank,
    res.grade,
    res.points_awarded,
    res.published_at,
    v_festival_level AS festival_level
  FROM published_results res
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN items itm ON itm.id = res.item_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
    AND participant.id IS NOT NULL
    AND (
      org.tenant_id = v_festival_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
      )
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.parent_id IN (
          SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
        )
      )
    )
  ORDER BY res.published_at DESC NULLS LAST, res.item_id, res.rank NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_published_results(uuid, uuid, boolean) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
