-- Admin item/individual result management data source.
--
-- This intentionally returns internally published results regardless of public
-- visibility. Public pages must continue to use public RPCs.

CREATE OR REPLACE FUNCTION public.get_admin_published_results(
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
  tenant_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_festival_id uuid;
  v_festival_tenant_id uuid;
  v_caller_is_admin boolean := false;
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
    SELECT fc.id INTO v_festival_id
    FROM festival_calendar fc
    WHERE fc.is_active IS TRUE
      AND (p_tenant_id IS NULL OR fc.tenant_id = p_tenant_id)
    ORDER BY fc.festival_year DESC, fc.start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  SELECT fc.tenant_id INTO v_festival_tenant_id
  FROM festival_calendar fc
  WHERE fc.id = v_festival_id;

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
    COALESCE(participant.name, '') AS participant_name,
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
    res.tenant_id AS tenant_id
  FROM results res
  LEFT JOIN registrations reg ON reg.id = res.registration_id
  LEFT JOIN LATERAL (
    SELECT schedules.id
    FROM schedules
    WHERE schedules.item_id = res.item_id
      AND schedules.tenant_id = COALESCE(res.tenant_id, v_festival_tenant_id)
    ORDER BY schedules.start_time DESC NULLS LAST, schedules.id DESC
    LIMIT 1
  ) sch ON TRUE
  LEFT JOIN items itm ON itm.id = res.item_id
  LEFT JOIN participants participant ON participant.id = reg.participant_id
  LEFT JOIN organisations org
    ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
  WHERE res.festival_id = v_festival_id
    AND res.published IS TRUE
    AND COALESCE(res.result_status, 'draft') = 'published'
    AND (
      p_tenant_id IS NULL
      OR res.tenant_id = p_tenant_id
      OR res.tenant_id = v_festival_tenant_id
      OR org.tenant_id = p_tenant_id
      OR org.tenant_id = v_festival_tenant_id
      OR org.parent_id IN (
        SELECT id FROM organisations WHERE tenant_id IN (p_tenant_id, v_festival_tenant_id)
      )
      OR org.tenant_id IN (
        SELECT DISTINCT o2.tenant_id
        FROM organisations o2
        WHERE o2.parent_id IN (
          SELECT id FROM organisations WHERE tenant_id IN (p_tenant_id, v_festival_tenant_id)
        )
      )
    )
  ORDER BY
    res.published_at DESC NULLS LAST,
    COALESCE(itm.item_name_ml, itm.item_name_en, ''),
    res.rank NULLS LAST,
    res.id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_published_results(uuid, uuid) TO authenticated;

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
  tenant_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.get_admin_published_results(p_tenant_id, p_festival_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_festival_results(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
