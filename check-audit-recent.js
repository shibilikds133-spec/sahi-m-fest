const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
client.connect()
  .then(()=>client.query("SELECT action, table_name, created_at, user_id FROM audit_logs WHERE created_at > now() - interval '1 day' AND table_name = 'registrations' ORDER BY created_at DESC LIMIT 10"))
  .then(r=>console.table(r.rows))
  .catch(console.error)
  .finally(()=>client.end());
