const { Client } = require("pg");

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres"
  });

  try {
    await client.connect();
    
    // Check recent results
    const res = await client.query(`
      SELECT r.item_id, i.item_name_en, r.published_at, f.custom_name as festival_name, r.festival_id, r.public_visible
      FROM public.results r
      JOIN public.items i ON i.id = r.item_id
      JOIN public.festival_calendar f ON f.id = r.festival_id
      ORDER BY r.published_at DESC NULLS LAST
      LIMIT 10;
    `);
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
