const { Client } = require('pg');

async function getTenant() {
  const mainClient = new Client({
    connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
  });

  try {
    await mainClient.connect();
    const res = await mainClient.query("SELECT id, name FROM tenants");
    console.log("Tenants in Main DB:");
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await mainClient.end();
  }
}

getTenant();
