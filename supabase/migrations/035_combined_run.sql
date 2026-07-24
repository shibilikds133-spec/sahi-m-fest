-- ============================================================
-- SAHI WEB: COMPLETE LEADERBOARD + RESULT VISIBILITY SQL
-- Run this entire block in Supabase SQL Editor at once.
-- Includes:
--   1. results.festival_id backfill
--   2. schedules.festival_id backfill
--   3. registrations.organisation_id backfill
--   4. result_status column + backfill
--   5. get_festival_results RPC (admin result management)
--   6. get_public_leaderboard RPC (final hierarchy-aware version)
-- ============================================================

-- ── STEP 1: Backfill results.festival_id ─────────────────────────────────────
UPDATE results r
SET festival_id = (
  SELECT fc.id
  FROM festival_calendar fc
  WHERE fc.tenant_id = r.tenant_id
    AND fc.is_active = TRUE
  ORDER BY fc.festival_year DESC
  LIMIT 1
)
WHERE r.festival_id IS NULL;

-- ── STEP 2: Backfill schedules.festival_id ───────────────────────────────────
UPDATE schedules s
SET festival_id = (
  SELECT fc.id
  FROM festival_calendar fc
  WHERE fc.tenant_id = s.tenant_id
    AND fc.is_active = TRUE
  ORDER BY fc.festival_year DESC
  LIMIT 1
)
WHERE s.festival_id IS NULL;

-- ── STEP 3: Backfill registrations.organisation_id from participant ──────────
UPDATE registrations r
SET organisation_id = (
  SELECT p.organisation_id
  FROM participants p
  WHERE p.id = r.participant_id
    AND p.organisation_id IS NOT NULL
  LIMIT 1
)
WHERE r.organisation_id IS NULL;

-- ── STEP 4: Add result_status column (backward-safe) ─────────────────────────
ALTER TABLE results
  ADD COLUMN IF NOT EXISTS result_status text
    DEFAULT 'published'
    CHECK (result_status IN ('draft', 'ready', 'published', 'hidden', 'archived'));

-- Backfill: published=TRUE → 'published', else → 'draft'
UPDATE results
SET result_status = CASE
  WHEN published IS TRUE THEN 'published'
  ELSE 'draft'
END
WHERE result_status IS NULL OR result_status = 'published';

-- Ensure all published=TRUE rows are 'published'
UPDATE results
SET result_status = 'published'
WHERE published IS TRUE AND result_status != 'published';

-- ── STEP 5: Admin Result Management RPC ──────────────────────────────────────
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
  published_at timestamptz,
  festival_id uuid,
  tenant_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    res.id AS result_id,
    res.registration_id,
    sch.id AS schedule_id,
    res.item_id,
    COALESCE(itm.item_name, '') AS item_name,
    COALESCE(itm.item_name_ml, '') AS item_name_ml,
    COALESCE(itm.is_group, false) AS is_group,
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    participant.id AS participant_id,
    CASE
      WHEN COALESCE(res.result_status, 'published') = 'published'
        THEN COALESCE(participant.name, '')
      ELSE ''
    END AS participant_name,
    COALESCE(participant.chest_number, '') AS chest_number,
    res.rank,
    res.grade,
    COALESCE(res.points_awarded, 0) AS points_awarded,
    res.total_score,
    COALESCE(res.published, false) AS published,
    COALESCE(res.result_status, 'published') AS result_status,
    res.published_at,
    res.festival_id,
    res.tenant_id
  FROM results res
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN schedules sch
    ON sch.item_id = res.item_id AND sch.tenant_id = res.tenant_id
  LEFT JOIN items itm ON itm.id = res.item_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE
    (p_tenant_id IS NULL OR res.tenant_id = p_tenant_id)
    AND (
      (p_festival_id IS NOT NULL AND res.festival_id = p_festival_id)
      OR (p_festival_id IS NULL AND EXISTS (
        SELECT 1 FROM festival_calendar fc
        WHERE fc.id = res.festival_id AND fc.is_active IS TRUE
      ))
    )
  ORDER BY
    CASE COALESCE(res.result_status, 'published')
      WHEN 'published' THEN 1
      WHEN 'ready'     THEN 2
      WHEN 'draft'     THEN 3
      WHEN 'hidden'    THEN 4
      WHEN 'archived'  THEN 5
    END,
    res.published_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_festival_results(uuid, uuid) TO authenticated;

-- ── STEP 6: Final Leaderboard RPC (hierarchy-aware + result_status filter) ───
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
  v_owner_org_id uuid;
BEGIN
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

  SELECT COALESCE(is_public_visible, false)
  INTO v_is_public_visible
  FROM festival_leaderboard_settings
  WHERE festival_id = v_festival_id
    AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_is_public_visible AND NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  SELECT id INTO v_owner_org_id
  FROM organisations
  WHERE tenant_id = (
    SELECT tenant_id FROM festival_calendar WHERE id = v_festival_id
  )
  LIMIT 1;

  RETURN QUERY
  SELECT
    org.id AS organisation_id,
    COALESCE(org.name, 'Unassigned') AS organisation_name,
    org.org_type AS organisation_type,
    org.parent_id,
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
  FROM results res
  JOIN festival_calendar festival ON festival.id = res.festival_id
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE
    res.published IS TRUE
    AND COALESCE(res.result_status, 'published') = 'published'
    AND res.festival_id = v_festival_id
    AND (
      v_owner_org_id IS NULL
      OR org.parent_id = v_owner_org_id
      OR org.tenant_id = (SELECT tenant_id FROM festival_calendar WHERE id = v_festival_id)
    )
  GROUP BY org.id, org.name, org.org_type, org.parent_id
  ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC, organisation_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_leaderboard(uuid, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ── VERIFY ───────────────────────────────────────────────────────────────────
SELECT
  'results' AS tbl,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE festival_id IS NOT NULL) AS with_festival_id,
  COUNT(*) FILTER (WHERE published = TRUE) AS published_count,
  COUNT(*) FILTER (WHERE result_status = 'published') AS status_published
FROM results;
