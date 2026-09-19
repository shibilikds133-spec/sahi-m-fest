const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT tenant_id, COUNT(*) 
    FROM festival_calendar 
    WHERE is_active = true 
    GROUP BY tenant_id 
    HAVING COUNT(*) > 1
  `);
  console.table(res.rows);
  await client.end();
}
run();
