const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    
    const { rows } = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'safe_unassign_registration'
    `);
    console.log(rows[0].prosrc);
    
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
