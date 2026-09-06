-- 1. Add enable_grace_marks to points_config
ALTER TABLE points_config ADD COLUMN IF NOT EXISTS enable_grace_marks boolean DEFAULT false;

-- 2. Create grace_marks table
CREATE TABLE IF NOT EXISTS grace_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  org_id uuid REFERENCES organisations(id),
  points integer DEFAULT 0,
  reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  UNIQUE (festival_id, org_id)
);

-- RLS Policies for grace_marks
ALTER TABLE grace_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY grace_marks_tenant_access ON grace_marks
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

-- 3. Drop existing leaderboard functions so we can modify their return signatures
DROP FUNCTION IF EXISTS public.get_public_leaderboard(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_admin_leaderboard(uuid, uuid);

-- 4. Recreate get_public_leaderboard
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
  latest_published_at timestamptz,
  grace_marks_awarded bigint
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
  v_enable_grace_marks boolean := false;
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

  -- 2. Get the festival's tenant_id
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

  -- Check if grace marks are enabled
  SELECT COALESCE(enable_grace_marks, false) INTO v_enable_grace_marks
  FROM points_config
  WHERE festival_id = v_festival_id
  ORDER BY config_version DESC
  LIMIT 1;

  -- 4. Execute query
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
      AND COALESCE(res.public_visible, false) IS TRUE
      AND reg.status IS DISTINCT FROM 'rejected'
    ORDER BY COALESCE(res.registration_id, res.id), res.item_id,
             res.published_at DESC NULLS LAST, res.id DESC
  )
  SELECT
    org.id                                                        AS organisation_id,
    COALESCE(org.name, 'Unassigned')                              AS organisation_name,
    org.org_type                                                  AS organisation_type,
    org.parent_id                                                 AS parent_id,
    COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0)::bigint + 
      (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS total_points,
    COUNT(*) FILTER (WHERE res.rank = 1)::bigint                 AS first_place_count,
    COUNT(*) FILTER (WHERE res.rank = 2)::bigint                 AS second_place_count,
    COUNT(*) FILTER (WHERE res.rank = 3)::bigint                 AS third_place_count,
    COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint             AS grade_a_plus_count,
    COUNT(*) FILTER (WHERE res.grade = 'A')::bigint              AS grade_a_count,
    COUNT(*) FILTER (WHERE res.grade = 'B')::bigint              AS grade_b_count,
    COUNT(*) FILTER (WHERE res.grade = 'C')::bigint              AS grade_c_count,
    COUNT(*)::bigint                                              AS result_count,
    MAX(res.published_at)                                         AS latest_published_at,
    (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS grace_marks_awarded
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

GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(uuid, uuid) TO anon, authenticated;

-- 5. Recreate get_admin_leaderboard
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
  latest_published_at timestamptz,
  grace_marks_awarded bigint
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
  v_enable_grace_marks boolean := false;
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

  -- Check if grace marks are enabled
  SELECT COALESCE(enable_grace_marks, false) INTO v_enable_grace_marks
  FROM points_config
  WHERE festival_id = v_festival_id
  ORDER BY config_version DESC
  LIMIT 1;

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
    COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0)::bigint + 
      (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS total_points,
    COUNT(*) FILTER (WHERE res.rank = 1)::bigint AS first_place_count,
    COUNT(*) FILTER (WHERE res.rank = 2)::bigint AS second_place_count,
    COUNT(*) FILTER (WHERE res.rank = 3)::bigint AS third_place_count,
    COUNT(*) FILTER (WHERE res.grade = 'A+')::bigint AS grade_a_plus_count,
    COUNT(*) FILTER (WHERE res.grade = 'A')::bigint AS grade_a_count,
    COUNT(*) FILTER (WHERE res.grade = 'B')::bigint AS grade_b_count,
    COUNT(*) FILTER (WHERE res.grade = 'C')::bigint AS grade_c_count,
    COUNT(*)::bigint AS result_count,
    MAX(res.published_at) AS latest_published_at,
    (CASE WHEN v_enable_grace_marks THEN COALESCE((SELECT SUM(gm.points) FROM grace_marks gm WHERE gm.festival_id = v_festival_id AND gm.org_id = org.id), 0) ELSE 0 END)::bigint AS grace_marks_awarded
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

GRANT EXECUTE ON FUNCTION public.get_admin_leaderboard(uuid, uuid) TO anon, authenticated;
