const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    
    // Simulate v_item loop query
    const fest = await client.query(`SELECT id FROM festival_calendar WHERE is_active = true LIMIT 1`);
    const fid = fest.rows[0].id;
    
    const v_items = await client.query(`
      SELECT r.item_id, MAX(i.item_name_en) as item_name, bool_and(COALESCE(r.public_visible, false)) as is_pub
      FROM public.results r
      JOIN public.items i ON i.id = r.item_id
      WHERE r.festival_id = $1
        AND (r.published = true OR COALESCE(r.result_status, 'draft') = 'published')
      GROUP BY r.item_id
    `, [fid]);
    
    console.log("v_items loop will run", v_items.rows.length, "times");
    console.table(v_items.rows);
    
    // Test the hypothetical points query for the first item
    if (v_items.rows.length > 0) {
      const item_id = v_items.rows[0].item_id;
      const hyp = await client.query(`
        WITH item_points AS (
          SELECT org.id AS organisation_id, SUM(COALESCE(r.points_awarded, 0)) as added_points
          FROM public.results r
          JOIN public.registrations reg ON reg.id = r.registration_id
          LEFT JOIN public.participants participant ON participant.id = reg.participant_id
          JOIN public.organisations org ON org.id = COALESCE(reg.organisation_id, participant.organisation_id)
          WHERE r.item_id = $1 AND r.festival_id = $2 AND COALESCE(r.public_visible, false) = false
          GROUP BY org.id
        )
        SELECT * FROM item_points;
      `, [item_id, fid]);
      console.log("Hypothetical points for item", item_id);
      console.table(hyp.rows);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
