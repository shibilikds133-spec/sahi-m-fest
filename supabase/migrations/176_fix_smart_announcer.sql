-- 176_fix_smart_announcer.sql
DROP FUNCTION IF EXISTS public.get_strategic_publish_order(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_strategic_publish_order(p_festival_id uuid, p_tenant_id uuid)
RETURNS TABLE (
  result_id text,
  item_name text,
  suspense_score numeric,
  recommended_order integer,
  new_1st_points numeric,
  new_2nd_points numeric,
  new_3rd_points numeric,
  leader_name text,
  is_public boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unpublished_item RECORD;
  v_new_points numeric[];
  v_score numeric;
  v_rank_1 numeric;
  v_rank_2 numeric;
  v_rank_3 numeric;
  v_leader text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS temp_suspense_scores (
    res_id text,
    i_name text,
    s_score numeric,
    p_1st numeric,
    p_2nd numeric,
    p_3rd numeric,
    l_name text
  ) ON COMMIT DROP;
  TRUNCATE temp_suspense_scores;

  CREATE TEMP TABLE IF NOT EXISTS current_points (
    org_id uuid,
    total_points numeric,
    org_name text
  ) ON COMMIT DROP;
  TRUNCATE current_points;

  INSERT INTO current_points (org_id, total_points, org_name)
  SELECT 
    reg.organisation_id, 
    SUM(COALESCE(r.points_awarded, 0)) as total_points,
    MAX(o.name)
  FROM public.results r
  JOIN public.registrations reg ON reg.id = r.registration_id
  JOIN public.organisations o ON o.id = reg.organisation_id
  WHERE r.festival_id = p_festival_id 
    AND r.public_visible = true
  GROUP BY reg.organisation_id;

  FOR v_unpublished_item IN 
    SELECT DISTINCT r.item_id, COALESCE(i.item_name_en, i.item_name_ml, i.item_code) as item_name
    FROM public.results r
    JOIN public.items i ON i.id = r.item_id
    WHERE r.festival_id = p_festival_id 
      AND r.result_status = 'published'
      AND r.public_visible = false
  LOOP
    WITH combined AS (
      SELECT org_id, total_points, org_name FROM current_points
      UNION ALL
      SELECT 
        reg.organisation_id as org_id,
        SUM(COALESCE(r.points_awarded, 0)) as total_points,
        MAX(o.name) as org_name
      FROM public.results r
      JOIN public.registrations reg ON reg.id = r.registration_id
      JOIN public.organisations o ON o.id = reg.organisation_id
      WHERE r.item_id = v_unpublished_item.item_id
      GROUP BY reg.organisation_id
    ),
    hypothetical_points AS (
      SELECT org_id, MAX(org_name) as org_name, SUM(total_points) as total_points
      FROM combined
      GROUP BY org_id
    )
    SELECT 
      array_agg(total_points ORDER BY total_points DESC),
      (SELECT org_name FROM hypothetical_points ORDER BY total_points DESC LIMIT 1)
    INTO v_new_points, v_leader
    FROM hypothetical_points;

    v_rank_1 := COALESCE(v_new_points[1], 0);
    v_rank_2 := COALESCE(v_new_points[2], 0);
    v_rank_3 := COALESCE(v_new_points[3], 0);
    v_score := COALESCE((v_rank_1 - v_rank_2) + (v_rank_2 - v_rank_3), 0);

    INSERT INTO temp_suspense_scores 
    VALUES (
      v_unpublished_item.item_id::text, 
      v_unpublished_item.item_name, 
      v_score, 
      v_rank_1, 
      v_rank_2, 
      v_rank_3, 
      COALESCE(v_leader, 'None')
    );
  END LOOP;

  RETURN QUERY 
  SELECT 
    res_id,
    i_name,
    s_score,
    (ROW_NUMBER() OVER (ORDER BY s_score ASC))::integer,
    p_1st,
    p_2nd,
    p_3rd,
    l_name,
    false as is_public
  FROM temp_suspense_scores
  ORDER BY s_score ASC;
END;
$$;
