const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    // find Alviora tenant
    const { rows: t_rows } = await client.query(`SELECT id FROM tenants WHERE name ILIKE '%alviora%'`);
    console.log('Tenants:', t_rows);
    for (const t of t_rows) {
      const { rows: r_rows } = await client.query(`
        SELECT r.item_id, r.published, r.result_status, r.public_visible, r.published_at 
        FROM results r
        JOIN items i ON i.id = r.item_id
        WHERE i.tenant_id = $1
        ORDER BY r.published_at DESC NULLS LAST LIMIT 5
      `, [t.id]);
      console.log(`Results for tenant ${t.id}:`);
      console.table(r_rows);
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
