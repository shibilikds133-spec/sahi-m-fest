const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT criteria_snapshot
      FROM public.mark_entries 
      WHERE id = '310ac3be-2c78-46be-a87a-afc5749982b3';
    `);
    console.log(JSON.stringify(res.rows[0].criteria_snapshot, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
