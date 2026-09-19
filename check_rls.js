const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT pol.polname, pol.polcmd, pol.polroles, pol.polqual, pol.polwithcheck
    FROM pg_policy pol
    JOIN pg_class tbl ON tbl.oid = pol.polrelid
    WHERE tbl.relname = 'results';
  `);
  console.table(res.rows);
  await client.end();
}
run();
