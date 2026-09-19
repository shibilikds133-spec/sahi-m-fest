const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT r.id, r.festival_id, r.item_id, r.public_visible, r.result_status
    FROM results r
    WHERE r.item_id IN ('4eb1841c-338e-4e4e-8177-3f3c4109b42b', 'eb7ae2d2-6ab9-496b-a8fd-f597181996e5')
  `);
  console.table(res.rows);
  await client.end();
}
run();
