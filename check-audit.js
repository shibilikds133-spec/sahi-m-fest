const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
client.connect()
  .then(()=>client.query(`
    SELECT * FROM audit_logs 
    WHERE record_id = '041b108a-e298-48b2-accb-74e8885f7d18'
    ORDER BY created_at DESC
    LIMIT 10
  `))
  .then(r=>console.table(r.rows))
  .catch(console.error)
  .finally(()=>client.end());
