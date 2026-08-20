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
  v_is_public_visible boolean := false;
  v_caller_is_admin boolean;
  v_festival_tenant_id uuid;
BEGIN
  -- 1. Resolve festival ID
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    -- Pick the most recently created active festival (so newer test festivals take priority)
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

  -- 2. Get the festival's tenant_id (the "parent" sector/division)
  SELECT tenant_id INTO v_festival_tenant_id
  FROM festival_calendar
  WHERE id = v_festival_id;

  -- 3. Verify visibility permissions
  -- v_is_public_visible is initialized to false, so if no row is found, it remains false.
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

  -- If it's not explicitly true, and the caller is not an admin, block access.
  IF (v_is_public_visible IS NOT TRUE) AND (NOT v_caller_is_admin) THEN
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
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'published') = 'published'
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
      -- Direct match: org belongs to the festival's tenant
      org.tenant_id = v_festival_tenant_id
      -- Child match: org is a child of an organisation in the festival tenant
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
      )
      -- Grandchild match: org's tenant has an org that's a child of festival tenant's org
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.parent_id IN (
          SELECT id FROM organisations WHERE tenant_id = v_festival_tenant_id
        )
      )
    )
  GROUP BY
    org.id,
    org.name,
    org.org_type,
    org.parent_id
  ORDER BY
    total_points DESC,
    first_place_count DESC,
    second_place_count DESC;
END;
$$;
