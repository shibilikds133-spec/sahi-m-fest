const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    await client.query(`DROP FUNCTION public.get_strategic_publish_order(uuid,uuid);`);
    await client.query(`
      CREATE OR REPLACE FUNCTION public.get_strategic_publish_order(p_festival_id uuid, p_tenant_id uuid)
       RETURNS TABLE(result_id uuid, item_name text, suspense_score numeric, recommended_order integer, new_1st_points numeric, new_2nd_points numeric, new_3rd_points numeric, leader_name text, is_public boolean)
       LANGUAGE plpgsql
       SECURITY DEFINER
       SET search_path TO 'public'
      AS $function$
      DECLARE
        v_item RECORD;
        v_new_points numeric[];
        v_score numeric;
        v_rank_1 numeric;
        v_rank_2 numeric;
        v_rank_3 numeric;
        v_leader text;
      BEGIN
        CREATE TEMP TABLE temp_suspense_scores (
          res_id uuid,
          i_name text,
          s_score numeric,
          p_1st numeric,
          p_2nd numeric,
          p_3rd numeric,
          l_name text,
          is_pub boolean
        ) ON COMMIT DROP;

        CREATE TEMP TABLE current_points ON COMMIT DROP AS
        SELECT 
          org.id AS organisation_id, 
          SUM(COALESCE(r.points_awarded, 0)) as total_points
        FROM public.results r
        JOIN public.registrations reg ON reg.id = r.registration_id
        LEFT JOIN public.participants participant ON participant.id = reg.participant_id
        JOIN public.organisations org ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
        WHERE r.festival_id = p_festival_id 
          AND (r.published = true OR r.result_status = 'published')
          AND COALESCE(r.public_visible, false) = true
        GROUP BY org.id;

        -- Loop through ALL approved results (published or unpublished)
        FOR v_item IN 
          SELECT r.item_id, MAX(i.item_name_en) as item_name, bool_and(COALESCE(r.public_visible, false)) as is_pub
          FROM public.results r
          JOIN public.items i ON i.id = r.item_id
          WHERE r.festival_id = p_festival_id 
            AND (r.published = true OR COALESCE(r.result_status, 'draft') = 'published')
          GROUP BY r.item_id
        LOOP
          IF v_item.is_pub THEN
            -- Already public, just use baseline for stats, score = 9999 (lowest priority)
            v_score := 9999;
            SELECT array_agg(total_points ORDER BY total_points DESC) INTO v_new_points FROM current_points;
            v_rank_1 := COALESCE(v_new_points[1], 0);
            v_rank_2 := COALESCE(v_new_points[2], 0);
            v_rank_3 := COALESCE(v_new_points[3], 0);
            SELECT o.name INTO v_leader FROM current_points hp JOIN public.organisations o ON o.id = hp.organisation_id ORDER BY hp.total_points DESC LIMIT 1;
          ELSE
            -- Unpublished, calculate impact
            CREATE TEMP TABLE hypothetical_points ON COMMIT DROP AS 
            WITH item_points AS (
              SELECT org.id AS organisation_id, SUM(COALESCE(r.points_awarded, 0)) as added_points
              FROM public.results r
              JOIN public.registrations reg ON reg.id = r.registration_id
              LEFT JOIN public.participants participant ON participant.id = reg.participant_id
              JOIN public.organisations org ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
              WHERE r.item_id = v_item.item_id AND r.festival_id = p_festival_id AND COALESCE(r.public_visible, false) = false
              GROUP BY org.id
            )
            SELECT COALESCE(cp.organisation_id, ip.organisation_id) AS organisation_id, COALESCE(cp.total_points, 0) + COALESCE(ip.added_points, 0) AS total_points
            FROM current_points cp
            FULL OUTER JOIN item_points ip ON ip.organisation_id = cp.organisation_id;

            SELECT array_agg(total_points ORDER BY total_points DESC) INTO v_new_points FROM hypothetical_points;
            v_rank_1 := COALESCE(v_new_points[1], 0);
            v_rank_2 := COALESCE(v_new_points[2], 0);
            v_rank_3 := COALESCE(v_new_points[3], 0);
            v_score := (v_rank_1 - v_rank_2) + (v_rank_2 - v_rank_3);
            SELECT o.name INTO v_leader FROM hypothetical_points hp JOIN public.organisations o ON o.id = hp.organisation_id ORDER BY hp.total_points DESC LIMIT 1;
            DROP TABLE hypothetical_points;
          END IF;

          INSERT INTO temp_suspense_scores 
          VALUES (
            v_item.item_id, v_item.item_name, v_score, v_rank_1, v_rank_2, v_rank_3, COALESCE(v_leader, 'None'), v_item.is_pub
          );
        END LOOP;

        RETURN QUERY 
        SELECT res_id, i_name, s_score, (ROW_NUMBER() OVER (ORDER BY s_score ASC))::integer, p_1st, p_2nd, p_3rd, l_name, is_pub
        FROM temp_suspense_scores
        ORDER BY s_score ASC;
      END;
      $function$;
    `);
    console.log("Updated RPC");
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
