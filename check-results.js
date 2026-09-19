const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    const { rows: r_rows } = await client.query(`
      SELECT item_id, published, result_status, public_visible 
      FROM results 
      WHERE festival_id = '9f172bb9-1dc1-4950-9302-e95028f6219d'
    `);
    console.table(r_rows);
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
