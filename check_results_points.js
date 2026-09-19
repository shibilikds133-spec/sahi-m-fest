const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT r.points_awarded, r.points_calculation, r.grade, r.rank, r.registration_id
      FROM public.results r
      WHERE r.schedule_id = 'fdcd2441-d871-4610-96c8-50790415b553';
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
