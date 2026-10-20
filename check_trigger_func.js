const { Client } = require('pg');
async function runSQL() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required in the private environment.');
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT prosrc
      FROM pg_proc
      WHERE proname = 'enforce_active_judge_assignment_for_marks';
    `);
    console.log(result.rows[0].prosrc);
  } catch (err) {
    console.error(err.message);
  } finally {
    await client.end();
  }
}
runSQL();
