const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    const res = await client.query(`
      SELECT p.*
      FROM public.points_config p
      JOIN public.festivals f ON p.festival_id = f.id
      JOIN public.tenants t ON f.tenant_id = t.id
      WHERE t.slug = 'alviora-test';
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
