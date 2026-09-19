const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT routine_definition
      FROM information_schema.routines
      WHERE routine_name = 'calculate_festival_points';
    `);
    console.log(res.rows[0]?.routine_definition);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
