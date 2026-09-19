const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT id, custom_name, is_active FROM festival_calendar WHERE id = '7ebe465a-8c64-4366-8faa-d04ff5d4b3d7';
  `);
  console.table(res.rows);
  await client.end();
}
run();
