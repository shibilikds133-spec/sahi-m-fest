const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function checkStatus() {
  try {
    await client.connect();
    
    // Check migrations table
    const res1 = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10');
    console.log("Last 10 migrations in DB:", res1.rows.map(r => r.version));

    // Check if _assert_import_access exists
    const res2 = await client.query(`
      SELECT p.proname 
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'public' AND p.proname = '_assert_import_access'
    `);
    console.log("_assert_import_access exists:", res2.rows.length > 0);

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
checkStatus();
