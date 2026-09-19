const { Client } = require('pg');
async function run() {
  const c = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
  await c.connect();
  const res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'items'");
  console.log(res.rows);
  await c.end();
}
run().catch(console.error);
