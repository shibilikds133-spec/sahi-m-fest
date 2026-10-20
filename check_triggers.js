const { Client } = require('pg');
async function runSQL() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required in the private environment.');
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT tgname, proname
      FROM pg_trigger
      JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid
      WHERE tgrelid = 'mark_entries'::regclass;
    `);
    console.log(result.rows);
  } catch (err) {
    console.error(err.message);
  } finally {
    await client.end();
  }
}
runSQL();
