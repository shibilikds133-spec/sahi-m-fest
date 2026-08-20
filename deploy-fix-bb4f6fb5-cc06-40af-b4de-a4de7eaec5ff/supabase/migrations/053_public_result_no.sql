-- 052_public_result_no.sql
-- Add public_result_no to results table
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS public_result_no INTEGER;

-- Create a global sequence for it
CREATE SEQUENCE IF NOT EXISTS results_public_result_no_seq;

-- Backfill existing published results
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT id FROM public.results 
    WHERE public_visible = true 
    ORDER BY published_at ASC NULLS LAST, id ASC
  LOOP
    IF (SELECT public_result_no FROM public.results WHERE id = r.id) IS NULL THEN
      UPDATE public.results 
      SET public_result_no = nextval('results_public_result_no_seq') 
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Create trigger function
CREATE OR REPLACE FUNCTION public.assign_public_result_no()
RETURNS TRIGGER AS $$
BEGIN
  -- If transitioning to public_visible = true AND it doesn't have a number yet
  IF NEW.public_visible = true AND OLD.public_visible = false AND NEW.public_result_no IS NULL THEN
    NEW.public_result_no := nextval('results_public_result_no_seq');
  END IF;
  -- If it was already public_visible but someone set it to true again, and it has no number
  IF NEW.public_visible = true AND NEW.public_result_no IS NULL THEN
    NEW.public_result_no := nextval('results_public_result_no_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_assign_public_result_no ON public.results;
CREATE TRIGGER trigger_assign_public_result_no
BEFORE UPDATE ON public.results
FOR EACH ROW
EXECUTE FUNCTION public.assign_public_result_no();

-- We also need it assigned on INSERT if inserted directly with public_visible = true
CREATE OR REPLACE FUNCTION public.assign_public_result_no_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.public_visible = true AND NEW.public_result_no IS NULL THEN
    NEW.public_result_no := nextval('results_public_result_no_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_assign_public_result_no_insert ON public.results;
CREATE TRIGGER trigger_assign_public_result_no_insert
BEFORE INSERT ON public.results
FOR EACH ROW
EXECUTE FUNCTION public.assign_public_result_no_insert();

-- Update the public published results query to return public_result_no
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
    WHERE res.festival_id = v_festival_id
      AND res.published IS TRUE
      AND COALESCE(res.result_status, 'draft') = 'published'
      AND (v_caller_is_admin OR COALESCE(res.public_visible, false) IS TRUE)
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

GRANT EXECUTE ON FUNCTION public.get_public_published_results(uuid, uuid, boolean) TO anon, authenticated;

-- Also update get_festival_results (internal admin view) to return it
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

GRANT EXECUTE ON FUNCTION public.get_festival_results(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
