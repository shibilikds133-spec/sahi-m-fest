const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.staging' });

const STAGING_DB = 'postgresql://postgres:m1o2n3u4907273@db.qpuzxoohyzjwdkhbxnjy.supabase.co:5432/postgres';

async function applyRPC() {
  const client = new Client({ connectionString: STAGING_DB });
  try {
    await client.connect();
    const sql = fs.readFileSync('supabase/migrations/168_participant_team_transfer.sql', 'utf8');
    await client.query(sql);
    console.log("Team Transfer RPC applied successfully to Staging DB!");
  } catch (err) {
    console.error("Failed to apply RPC:", err);
  } finally {
    await client.end();
  }
}

applyRPC();
