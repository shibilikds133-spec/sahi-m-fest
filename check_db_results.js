const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT id, schedule_id, item_id, published, result_status, public_visible
    FROM public.results
    LIMIT 10;
  `);
  console.table(res.rows);
  await client.end();
}
run();
