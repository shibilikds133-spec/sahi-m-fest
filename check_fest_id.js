const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const fest = await client.query(`SELECT id, custom_name, is_active FROM festival_calendar`);
  console.table(fest.rows);
  
  const resFests = await client.query(`SELECT DISTINCT festival_id FROM results`);
  console.table(resFests.rows);
  await client.end();
}
run();
