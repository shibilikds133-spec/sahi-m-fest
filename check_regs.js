const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT r.id, r.points_awarded, r.public_visible, reg.status, org.name
    FROM public.results r
    LEFT JOIN public.registrations reg ON reg.id = r.registration_id
    LEFT JOIN public.organisations org ON org.id = reg.organisation_id
    WHERE r.item_id = 'eb7ae2d2-6ab9-496b-a8fd-f597181996e5'
  `);
  console.table(res.rows);
  await client.end();
}
run();
