const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res2 = await client.query(`
    SELECT * FROM get_strategic_publish_order('de289845-e465-4c7e-a470-820412156202', 'f247b04f-a6d0-4b36-896d-efae2b7e3b30');
  `);
  console.table(res2.rows);
  await client.end();
}
run();
