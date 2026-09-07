-- The Suspense Publisher Plugin
-- This RPC analyzes unpublished results and recommends the BEST result to publish next
-- in order to minimize the point difference between the top 3 teams.

CREATE OR REPLACE FUNCTION public.get_strategic_publish_order(p_festival_id uuid, p_tenant_id uuid)
RETURNS TABLE (
  result_id uuid,
  item_name text,
  suspense_score numeric,
  recommended_order integer,
  new_1st_points numeric,
  new_2nd_points numeric,
  new_3rd_points numeric,
  leader_name text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_leaderboard jsonb;
  v_unpublished_results RECORD;
  v_result_points jsonb;
  v_new_points numeric[];
  v_score numeric;
  v_temp_points numeric;
  v_temp_org_id uuid;
  v_rank_1 numeric;
  v_rank_2 numeric;
  v_rank_3 numeric;
  v_leader text;
BEGIN
  -- 1. Create a temporary table to hold the scores for each result
  CREATE TEMP TABLE temp_suspense_scores (
    res_id uuid,
    i_name text,
    s_score numeric,
    p_1st numeric,
    p_2nd numeric,
    p_3rd numeric,
    l_name text
  ) ON COMMIT DROP;

  -- 2. Get current baseline points for all organisations in this festival
  -- We'll use a simplified baseline query based on already published results
  CREATE TEMP TABLE current_points ON COMMIT DROP AS
  SELECT 
    organisation_id, 
    SUM(points_awarded) as total_points
  FROM public.results
  WHERE festival_id = p_festival_id AND is_published = true
  GROUP BY organisation_id;

  -- 3. Loop through all UNPUBLISHED (but approved) results
  FOR v_unpublished_results IN 
    SELECT r.id, i.name as item_name 
    FROM public.results r
    JOIN public.items i ON i.id = r.item_id
    WHERE r.festival_id = p_festival_id 
      AND r.is_published = false 
      AND r.status = 'approved'
  LOOP
    
    -- Create a copy of current points
    CREATE TEMP TABLE hypothetical_points ON COMMIT DROP AS 
    SELECT * FROM current_points;

    -- Add the points from this specific result
    -- Since we don't have the exact marks structure in this simplified script,
    -- we'll assume the result row itself contains the points or we join with marks.
    -- For simplicity, let's assume we can calculate it (mocking it for the architectural proof)
    
    -- In reality, we would extract the points awarded by this result 
    -- and update hypothetical_points.
    
    -- 4. Calculate the Suspense Score
    SELECT array_agg(total_points ORDER BY total_points DESC) INTO v_new_points 
    FROM hypothetical_points;

    v_rank_1 := COALESCE(v_new_points[1], 0);
    v_rank_2 := COALESCE(v_new_points[2], 0);
    v_rank_3 := COALESCE(v_new_points[3], 0);

    -- The Suspense Score: (Difference between 1st and 2nd) + (Difference between 2nd and 3rd)
    -- Lower score means higher suspense!
    v_score := (v_rank_1 - v_rank_2) + (v_rank_2 - v_rank_3);

    -- Get leader name
    SELECT o.name INTO v_leader 
    FROM hypothetical_points hp
    JOIN public.organisations o ON o.id = hp.organisation_id
    ORDER BY hp.total_points DESC LIMIT 1;

    INSERT INTO temp_suspense_scores 
    VALUES (
      v_unpublished_results.id, 
      v_unpublished_results.item_name, 
      v_score, 
      v_rank_1, 
      v_rank_2, 
      v_rank_3, 
      COALESCE(v_leader, 'None')
    );

  END LOOP;

  -- 5. Return the sorted recommendations
  RETURN QUERY 
  SELECT 
    res_id,
    i_name,
    s_score,
    (ROW_NUMBER() OVER (ORDER BY s_score ASC))::integer,
    p_1st,
    p_2nd,
    p_3rd,
    l_name
  FROM temp_suspense_scores
  ORDER BY s_score ASC;

END;
$$;
