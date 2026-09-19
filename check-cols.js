const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'registrations'
    `);
    console.table(rows);
    
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
