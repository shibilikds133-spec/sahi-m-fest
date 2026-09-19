const { Client } = require('pg');
async function run() {
  const c = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
  await c.connect();
  const sql = `CREATE OR REPLACE FUNCTION public.get_leaderboard_preview(
    p_tenant_id uuid,
    p_festival_id uuid,
    p_ranking_mode text,
    p_item_limit integer,
    p_use_public_only boolean DEFAULT false
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

    SELECT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
    ) INTO v_caller_is_admin;

    IF NOT v_caller_is_admin THEN
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
    WITH limited_items AS (
      SELECT item_id
      FROM results
      WHERE festival_id = v_festival_id
        AND published IS TRUE
        AND COALESCE(result_status, 'draft') IN ('published', 'ready')
        AND (NOT p_use_public_only OR COALESCE(public_visible, false) IS TRUE)
      GROUP BY item_id
      ORDER BY MIN(published_at) ASC, item_id ASC
      LIMIT (CASE WHEN COALESCE(p_ranking_mode, 'ALL') = 'LIMITED' AND p_item_limit IS NOT NULL AND p_item_limit > 0 THEN p_item_limit ELSE 999999 END)
    ),
    deduped_results AS (
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
        AND COALESCE(res.result_status, 'draft') IN ('published', 'ready')
        AND (NOT p_use_public_only OR COALESCE(res.public_visible, false) IS TRUE)
        AND reg.status IS DISTINCT FROM 'rejected'
        AND res.item_id IN (SELECT item_id FROM limited_items)
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
          WHERE o2.id = org.parent_id AND o2.tenant_id = v_festival_tenant_id
        )
      )
    GROUP BY org.id
    HAVING COALESCE(SUM(COALESCE(res.points_awarded, 0)), 0) > 0 OR COUNT(*) > 0
    ORDER BY total_points DESC, first_place_count DESC, second_place_count DESC, third_place_count DESC, grade_a_count DESC;
  END;
  $$;`;
  await c.query(sql);
  console.log('SUCCESS');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
