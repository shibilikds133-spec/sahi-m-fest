const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT proname
    FROM pg_proc 
    WHERE proname LIKE '%finalize%' OR proname LIKE '%lock%';
  `);
  console.log(res.rows);
  await client.end();
}
run();
