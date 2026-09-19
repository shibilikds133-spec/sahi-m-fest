const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res2 = await client.query(`
    SELECT * FROM get_strategic_publish_order('7ebe465a-8c64-4366-8faa-d04ff5d4b3d7', 'f87172d1-ed27-4db4-842c-cc00d3d56de2');
  `);
  console.table(res2.rows);
  await client.end();
}
run();
