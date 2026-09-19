const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    
    // Check recent results
    const res = await client.query(`
      SELECT r.item_id, i.item_name_en, r.published, r.result_status, r.public_visible, r.points_awarded
      FROM public.results r
      JOIN public.items i ON i.id = r.item_id
      ORDER BY r.published_at DESC NULLS LAST
      LIMIT 10;
    `);
    console.log("Recent Results:");
    console.table(res.rows);

    // Run the RPC for the active festival
    const fest = await client.query(`SELECT id, tenant_id FROM festival_calendar WHERE is_active = true LIMIT 1`);
    if (fest.rows.length > 0) {
      console.log("Active Festival:", fest.rows[0].id);
      const rpc = await client.query(`SELECT * FROM get_strategic_publish_order($1, $2)`, [fest.rows[0].id, fest.rows[0].tenant_id]);
      console.log("Announcer Queue:");
      console.table(rpc.rows);
    }
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
