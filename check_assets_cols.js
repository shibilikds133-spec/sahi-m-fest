const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT column_name
    FROM information_schema.columns 
    WHERE table_name = 'generated_assets';
  `);
  console.log(res.rows.map(r => r.column_name));
  await client.end();
}
run();
