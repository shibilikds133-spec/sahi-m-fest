const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT proargnames, proargmodes
    FROM pg_proc 
    WHERE proname = 'get_strategic_publish_order';
  `);
  console.log(res.rows[0]);
  await client.end();
}
run();
