const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function test() {
  try {
    await client.connect();
    
    console.log("Connected to DB!");
    
    // 1. Check migrations
    const res1 = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5');
    console.log("Last 5 migrations in DB:", res1.rows.map(r => r.version));
    
    // 2. Check if upsert_judge_mark exists
    const res2 = await client.query(`
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args 
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'public' AND p.proname = 'upsert_judge_mark'
    `);
    console.log("upsert_judge_mark in DB:", res2.rows);

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
test();
