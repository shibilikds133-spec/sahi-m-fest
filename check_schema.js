const { Client } = require('pg');
async function run() {
  const c = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
  await c.connect();
  const res = await c.query("SELECT * FROM get_admin_published_results(NULL, NULL) LIMIT 1;");
  console.log(Object.keys(res.rows[0] || {}));
  await c.end();
}
run().catch(console.error);
