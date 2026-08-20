const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function reload() {
  try {
    await client.connect();
    console.log("Connected to DB, triggering schema reload...");
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("Schema reload triggered.");
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
reload();
