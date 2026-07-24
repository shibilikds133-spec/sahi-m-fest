-- ============================================================
-- Migration 056: Filter Rejected Registrations
-- Clean up existing rejected registrations and update database
-- functions to explicitly ignore registrations with status = 'rejected'.
-- ============================================================

-- 1. Clean up existing rejected registrations (set code_letter = NULL)
UPDATE public.registrations
SET code_letter = NULL
WHERE status = 'rejected' AND code_letter IS NOT NULL;

-- 2. Recreate get_judge_registrations with rejection filter
CREATE OR REPLACE FUNCTION public.get_judge_registrations(p_schedule_id uuid)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  tenant_id uuid,
  code_letter text,
  participant_name text,
  chest_number text,
  photo_url text,
  category_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    r.id,
    r.item_id,
    r.tenant_id,
    r.code_letter,
    p.name AS participant_name,
    p.chest_number,
    p.photo_url,
    p.category_code
  FROM registrations r
  JOIN schedules s ON s.id = p_schedule_id
  LEFT JOIN participants p ON p.id = r.participant_id
  WHERE r.item_id = s.item_id
    AND r.status IS DISTINCT FROM 'rejected'
    AND r.code_letter IS NOT NULL
  ORDER BY r.code_letter;
$$;

-- 3. Recreate get_schedule_readiness with rejection filter
CREATE OR REPLACE FUNCTION public.get_schedule_readiness(p_schedule_id uuid)
RETURNS TABLE (
  registration_id   uuid,
  code_letter       text,
  submitted_count   bigint,
  pending_count     bigint,
  expected_count    int,
  all_submitted     boolean,
  readiness_status  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    reg.id                                                                        AS registration_id,
    reg.code_letter,
    COUNT(me.id) FILTER (WHERE me.is_final = true)                               AS submitted_count,
    (s.expected_judge_count
      - COUNT(me.id) FILTER (WHERE me.is_final = true))                          AS pending_count,
    s.expected_judge_count                                                        AS expected_count,
    COUNT(me.id) FILTER (WHERE me.is_final = true) >= s.expected_judge_count     AS all_submitted,
    CASE
      WHEN COUNT(me.id) FILTER (WHERE me.is_final = true) >= s.expected_judge_count
        THEN 'Ready for Calculation'
      WHEN COUNT(me.id) FILTER (WHERE me.is_final = true) > 0
        THEN 'Partially Submitted'
      ELSE 'Waiting for Judges'
    END                                                                           AS readiness_status
  FROM registrations reg
  CROSS JOIN schedules s
  LEFT JOIN mark_entries me
         ON me.registration_id = reg.id
        AND me.schedule_id     = p_schedule_id
  WHERE s.id          = p_schedule_id
    AND reg.item_id   = s.item_id
    AND reg.status IS DISTINCT FROM 'rejected'
    AND reg.code_letter IS NOT NULL
  GROUP BY reg.id, reg.code_letter, s.expected_judge_count;
$$;

-- 4. Recreate get_judge_submission_summary with rejection filter
CREATE OR REPLACE FUNCTION public.get_judge_submission_summary(p_schedule_id uuid)
RETURNS TABLE (
  judge_id        uuid,
  judge_name      text,
  submitted_count bigint,
  draft_count     bigint,
  total_assigned  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH reg_count AS (
    SELECT COUNT(r.id)::bigint AS total_regs
    FROM registrations r
    JOIN schedules s ON s.id = p_schedule_id
    WHERE r.item_id = s.item_id
      AND r.status IS DISTINCT FROM 'rejected'
      AND r.code_letter IS NOT NULL
  )
  SELECT
    j.id                                               AS judge_id,
    j.name                                             AS judge_name,
    COUNT(me.id) FILTER (WHERE me.is_final = true)     AS submitted_count,
    COUNT(me.id) FILTER (WHERE me.is_draft = true)     AS draft_count,
    rc.total_regs                                      AS total_assigned
  FROM judges j
  JOIN judge_tokens jt ON jt.judge_id = j.id AND jt.schedule_id = p_schedule_id
  CROSS JOIN reg_count rc
  LEFT JOIN mark_entries me
         ON me.judge_id        = j.id
        AND me.schedule_id     = p_schedule_id
  GROUP BY j.id, j.name, rc.total_regs;
$$;

-- 5. Recreate get_festival_results with rejection filter
DROP FUNCTION IF EXISTS public.get_festival_results(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_festival_results(
  p_tenant_id uuid DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE (
  result_id uuid,
  registration_id uuid,
  schedule_id uuid,
  item_id uuid,
  item_name text,
  item_name_ml text,
  is_group boolean,
  organisation_id uuid,
  organisation_name text,
  participant_id uuid,
  participant_name text,
  chest_number text,
  rank integer,
  grade text,
  points_awarded integer,
  total_score numeric,
  published boolean,
  result_status text,
  public_visible boolean,
  collection_method text,
  published_at timestamptz,
  festival_id uuid,
  tenant_id uuid,
  public_result_no integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  SELECT (p_tenant_id IS NOT NULL OR p_festival_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    res.id AS result_id,
    res.registration_id AS registration_id,
    sch.id AS schedule_id,
    res.item_id AS item_id,
    COALESCE(itm.item_name_en, '') AS item_name,
    COALESCE(itm.item_name_ml, '') AS item_name_ml,
    COALESCE(itm.participation_type = 'group', false) AS is_group,
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    participant.id AS participant_id,
    CASE
      WHEN COALESCE(res.result_status, 'draft') = 'published'
        THEN COALESCE(participant.name, '')
      ELSE ''
    END AS participant_name,
    COALESCE(participant.chest_number, '') AS chest_number,
    res.rank AS rank,
    res.grade AS grade,
    COALESCE(res.points_awarded, 0) AS points_awarded,
    res.total_score AS total_score,
    COALESCE(res.published, false) AS published,
    COALESCE(res.result_status, 'draft') AS result_status,
    COALESCE(res.public_visible, false) AS public_visible,
    res.collection_method AS collection_method,
    res.published_at AS published_at,
    res.festival_id AS festival_id,
    res.tenant_id AS tenant_id,
    res.public_result_no AS public_result_no
  FROM results res
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN schedules sch
    ON sch.item_id = res.item_id
   AND sch.tenant_id = res.tenant_id
  LEFT JOIN items itm ON itm.id = res.item_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE
    (
      p_tenant_id IS NULL
      OR res.tenant_id = p_tenant_id
      OR org.tenant_id = p_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = p_tenant_id
      )
    )
    AND (
      (p_festival_id IS NOT NULL AND res.festival_id = p_festival_id)
      OR (p_festival_id IS NULL AND EXISTS (
        SELECT 1 FROM festival_calendar fc
        WHERE fc.id = res.festival_id AND fc.is_active IS TRUE
      ))
    )
    AND reg.status IS DISTINCT FROM 'rejected'
  ORDER BY
    CASE COALESCE(res.result_status, 'draft')
      WHEN 'published' THEN 1
      WHEN 'ready'     THEN 2
      WHEN 'draft'     THEN 3
      WHEN 'hidden'    THEN 4
      WHEN 'archived'  THEN 5
    END,
    res.published_at DESC NULLS LAST;
END;
$$;

-- 6. Recreate get_public_leaderboard with rejection filter
CREATE OR REPLACE FUNCTION public.get_public_leaderboard(
  p_tenant_id uuid DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE (
  organisation_id uuid,
  organisation_name text,
  organisation_type text,
  parent_id uuid,
  total_points bigint,
  first_place_count bigint,
  second_place_count bigint,
  third_place_count bigint,
  grade_a_plus_count bigint,
  grade_a_count bigint,
  grade_b_count bigint,
  grade_c_count bigint,
  result_count bigint,
  latest_published_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_festival_id uuid;
  v_is_public_visible boolean;
  v_caller_is_admin boolean;
  v_festival_tenant_id uuid;
BEGIN
  -- 1. Resolve festival ID
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Get the festival's tenant_id (the "parent" sector/division)
  SELECT tenant_id INTO v_festival_tenant_id
  FROM festival_calendar
  WHERE id = v_festival_id;

  -- 3. Verify visibility permissions
  SELECT COALESCE(is_public_visible, false)
  INTO v_is_public_visible
  FROM festival_leaderboard_settings
  WHERE festival_id = v_festival_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_is_public_visible AND NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  -- 4. Execute with corrected hierarchy-aware org filter
  RETURN QUERY
  WITH deduped_results AS (
    SELECT DISTINCT ON (COALESCE(res.registration_id, res.id), res.item_id)
      res.id           AS result_id,
      res.points_awarded,
      res.rank,
      res.grade,
      res.published_at,
      res.registration_id,
      res.festival_id
    FROM results res
    LEFT JOIN registrations reg ON reg.id = res.registration_id
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'published') = 'published'
      AND reg.status IS DISTINCT FROM 'rejected'
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
  SELECT
    org.id                                                        AS organisation_id,
    COALESCE(org.name, 'Unassigned')                             AS organisation_name,
    org.org_type                                                  AS organisation_type,
    org.parent_id                                                 AS parent_id,
    COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0)::bigint    AS total_points,
    COUNT(*) FILTER (WHERE res.rank = 1)::bigint                 AS first_place_count,
    COUNT(*) FILTER (WHERE res.rank = 2)::bigint                 AS second_place_count,
    COUNT(*) FILTER (WHERE res.rank = 3)::bigint                 AS third_place_count,
    COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint             AS grade_a_plus_count,
    COUNT(*) FILTER (WHERE res.grade = 'A')::bigint              AS grade_a_count,
    COUNT(*) FILTER (WHERE res.grade = 'B')::bigint              AS grade_b_count,
    COUNT(*) FILTER (WHERE res.grade = 'C')::bigint              AS grade_c_count,
    COUNT(*)::bigint                                              AS result_count,
    MAX(res.published_at)                                         AS latest_published_at
  FROM deduped_results res
  JOIN festival_calendar festival ON festival.id = res.festival_id
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
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
  GROUP BY org.id, org.name, org.org_type, org.parent_id
  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC,
           organisation_name ASC;
END;
$$;

-- 7. Recreate get_admin_leaderboard with rejection filter
CREATE OR REPLACE FUNCTION public.get_admin_leaderboard(
  p_tenant_id uuid DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE (
  organisation_id uuid,
  organisation_name text,
  organisation_type text,
  parent_id uuid,
  total_points bigint,
  first_place_count bigint,
  second_place_count bigint,
  third_place_count bigint,
  grade_a_plus_count bigint,
  grade_a_count bigint,
  grade_b_count bigint,
  grade_c_count bigint,
  result_count bigint,
  latest_published_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_festival_id uuid;
  v_caller_is_admin boolean := false;
  v_festival_tenant_id uuid;
BEGIN
  SELECT (p_tenant_id IS NOT NULL OR p_festival_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RETURN;
  END IF;

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

  SELECT fc.tenant_id INTO v_festival_tenant_id
  FROM festival_calendar fc
  WHERE fc.id = v_festival_id;

  RETURN QUERY
  WITH deduped_results AS (
    SELECT DISTINCT ON (COALESCE(res.registration_id, res.id), res.item_id)
      res.id AS result_id,
      res.points_awarded,
      res.rank,
      res.grade,
      res.published_at,
      res.registration_id,
      res.festival_id
    FROM results res
    LEFT JOIN registrations reg ON reg.id = res.registration_id
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') = 'published'
      AND reg.status IS DISTINCT FROM 'rejected'
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
  SELECT
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    org.org_type AS organisation_type,
    org.parent_id AS parent_id,
    COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0)::bigint AS total_points,
    COUNT(*) FILTER (WHERE res.rank = 1)::bigint AS first_place_count,
    COUNT(*) FILTER (WHERE res.rank = 2)::bigint AS second_place_count,
    COUNT(*) FILTER (WHERE res.rank = 3)::bigint AS third_place_count,
    COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint AS grade_a_plus_count,
    COUNT(*) FILTER (WHERE res.grade = 'A')::bigint AS grade_a_count,
    COUNT(*) FILTER (WHERE res.grade = 'B')::bigint AS grade_b_count,
    COUNT(*) FILTER (WHERE res.grade = 'C')::bigint AS grade_c_count,
    COUNT(*)::bigint AS result_count,
    MAX(res.published_at) AS latest_published_at
  FROM deduped_results res
  JOIN festival_calendar festival ON festival.id = res.festival_id
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE org.id IS NOT NULL
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
  GROUP BY org.id, org.name, org.org_type, org.parent_id
  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC, third_place_count DESC, organisation_name ASC;
END;
$$;

-- 8. Recreate get_public_published_results with rejection filter
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
  chest_number text,
  participant_category_code text,
  rank integer,
  grade text,
  points_awarded integer,
  published_at timestamptz,
  festival_level text,
  public_result_no integer
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
  v_caller_is_admin boolean := false;
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

  SELECT (p_tenant_id IS NOT NULL OR p_festival_id IS NOT NULL) AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF (v_is_public_visible IS NOT TRUE) AND (NOT v_caller_is_admin) THEN
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
      res.festival_id,
      res.public_result_no
    FROM results res
    LEFT JOIN registrations reg ON reg.id = res.registration_id
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') = 'published'
      AND (v_caller_is_admin OR COALESCE(res.public_visible, false) IS TRUE)
      AND reg.status IS DISTINCT FROM 'rejected'
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
    v_festival_level AS festival_level,
    res.public_result_no
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

-- 9. Recreate get_public_candidate_profile with rejection filter
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
        AND reg.status IS DISTINCT FROM 'rejected'
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
        AND reg.status IS DISTINCT FROM 'rejected'
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_candidate_profile(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_published_results(uuid, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_festival_results(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_leaderboard(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_judge_registrations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedule_readiness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_judge_submission_summary(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
