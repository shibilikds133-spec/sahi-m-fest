const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
client.connect()
  .then(()=>client.query("SELECT id, role, is_superadmin, full_name, tenant_id, team_leader_code FROM profiles WHERE tenant_id IS NULL"))
  .then(r=>console.table(r.rows))
  .catch(console.error)
  .finally(()=>client.end());
