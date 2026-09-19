const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT id, storage_path, public_url, created_at FROM generated_assets ORDER BY created_at DESC LIMIT 5;
  `);
  console.table(res.rows);
  await client.end();
}
run();
