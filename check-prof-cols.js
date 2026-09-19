const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
client.connect()
  .then(()=>client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'"))
  .then(r=>console.table(r.rows))
  .catch(console.error)
  .finally(()=>client.end());
