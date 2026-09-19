const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

async function run() {
  const connectionString = `postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres`;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("Connected successfully!");
    
    const sql = fs.readFileSync('supabase/migrations/174_fix_admin_bypass_item_visibility.sql', 'utf8');
    await client.query(sql);
    console.log("SQL executed successfully!");
    
    await client.end();
  } catch (err) {
    console.error("Connection error", err.stack);
  }
}
run();
