const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  try {
    const res = await client.query("SELECT id, festival_id, type FROM generated_assets LIMIT 1;");
    console.log("Found generated_assets:", res.rows);
  } catch (e) {
    console.error("Error:", e.message);
  }
  await client.end();
}
run();
