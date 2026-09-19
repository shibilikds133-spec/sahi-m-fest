const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
client.connect()
  .then(()=>client.query(`
    SELECT r.id as reg_id, r.tenant_id as reg_tenant, r.participant_id, p.tenant_id as prof_tenant
    FROM registrations r
    JOIN profiles p ON p.role = 'team_leader'
    WHERE r.tenant_id != p.tenant_id
    LIMIT 5
  `))
  .then(r=>console.table(r.rows))
  .catch(console.error)
  .finally(()=>client.end());
