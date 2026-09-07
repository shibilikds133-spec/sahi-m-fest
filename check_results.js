const { Client } = require('pg');

async function checkRows() {
  const mainClient = new Client({
    connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
  });

  try {
    await mainClient.connect();
    const res = await mainClient.query("SELECT tenant_id, COUNT(*) FROM results GROUP BY tenant_id ORDER BY COUNT(*) DESC");
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await mainClient.end();
  }
}

checkRows();
