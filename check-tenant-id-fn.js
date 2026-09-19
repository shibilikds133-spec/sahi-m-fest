const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
client.connect()
  .then(()=>client.query("SELECT prosrc FROM pg_proc WHERE proname = 'get_my_tenant_id'"))
  .then(r=>console.log(r.rows[0].prosrc))
  .catch(console.error)
  .finally(()=>client.end());
