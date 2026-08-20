const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new Client({
    connectionString: 'postgres://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
  });
  await client.connect();
  
  const sql = fs.readFileSync(path.join(__dirname, 'supabase/migrations/120_fix_festival_teams_recursion.sql'), 'utf8');
  await client.query(sql);
  
  console.log('Migration applied successfully');
  await client.end();
}
run().catch(console.error);
