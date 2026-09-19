const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT * FROM festival_calendar ORDER BY festival_year DESC;
  `);
  console.table(res.rows);
  await client.end();
}
run();
