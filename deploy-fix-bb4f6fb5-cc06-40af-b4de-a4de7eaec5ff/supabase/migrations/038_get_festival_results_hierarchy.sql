-- ============================================================
-- SAHI WEB: GET_FESTIVAL_RESULTS HIERARCHY & VALIDATION FIX
-- Replaces get_festival_results to support multi-tenant hierarchy.
-- Ensures parent sector/division admins can see results belonging to
-- their child units/organizations, preventing empty result lists.
-- ============================================================

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
  -- 1. Verify caller permissions
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RETURN;
  END IF;

  -- 2. Execute query with parent-child tenant support
  RETURN QUERY
  SELECT
    res.id AS result_id,
    res.registration_id,
    sch.id AS schedule_id,
    res.item_id,
    COALESCE(itm.item_name_en, '') AS item_name,
    COALESCE(itm.item_name_ml, '') AS item_name_ml,
    COALESCE(itm.participation_type = 'group', false) AS is_group,
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
    (
      p_tenant_id IS NULL 
      OR res.tenant_id = p_tenant_id
      OR org.tenant_id = p_tenant_id
      OR org.parent_id IN (SELECT id FROM organisations WHERE tenant_id = p_tenant_id)
    )
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

NOTIFY pgrst, 'reload schema';
