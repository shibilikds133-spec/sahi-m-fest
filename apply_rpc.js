const { Client } = require('pg');
const fs = require('fs');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
  });
  
  await client.connect();
  
  const sql = fs.readFileSync('supabase/migrations/173_leaderboard_preview_rpc.sql', 'utf8');
  await client.query(sql);
  console.log('Migration applied directly to DB');
  
  await client.end();
}

main().catch(console.error);
