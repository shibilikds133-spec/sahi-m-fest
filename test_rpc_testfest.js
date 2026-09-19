const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    const festId = 'de289845-e465-4c7e-a470-820412156202';
    const fest = await client.query(`SELECT tenant_id FROM festival_calendar WHERE id = $1`, [festId]);
    const tenantId = fest.rows[0].tenant_id;
    
    console.log("Testing with festival", festId, "tenant", tenantId);
    const res = await client.query(`SELECT * FROM get_strategic_publish_order($1, $2)`, [festId, tenantId]);
    console.log("RPC returned:", res.rows);
  } catch (err) {
    console.error("RPC Error:", err);
  } finally {
    await client.end();
  }
}
run();
