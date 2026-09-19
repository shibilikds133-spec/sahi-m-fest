const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p
      WHERE p.proname = 'get_strategic_publish_order';
    `);
    console.log(res.rows[0]?.pg_get_functiondef);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
