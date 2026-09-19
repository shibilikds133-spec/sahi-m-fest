const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT r.id, r.festival_id, i.item_name_en, r.published, r.result_status, r.public_visible, r.published_at
    FROM results r
    LEFT JOIN items i ON i.id = r.item_id
    ORDER BY r.published_at DESC NULLS LAST
    LIMIT 3;
  `);
  console.table(res.rows);
  await client.end();
}
run();
