const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'admin_upsert_mark_entry';
  `);
  console.log(res.rows[0]?.prosrc);
  await client.end();
}
run();
