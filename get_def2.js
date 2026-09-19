const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function run() {
  const connectionString = `postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres`;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT pg_get_functiondef(oid)
      FROM pg_proc
      WHERE proname = 'get_public_published_results'
    `);
    console.log(res.rows[0].pg_get_functiondef);
    await client.end();
  } catch (err) {
    console.error("Connection error", err.stack);
  }
}
run();
