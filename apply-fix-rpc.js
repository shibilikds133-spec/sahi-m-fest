const { Client } = require('pg');
const fs = require('fs');
const client = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
client.connect()
  .then(()=> {
    const sql = fs.readFileSync('test-fix-rpc.sql', 'utf8');
    return client.query(sql);
  })
  .then(()=>console.log('Success'))
  .catch(console.error)
  .finally(()=>client.end());
