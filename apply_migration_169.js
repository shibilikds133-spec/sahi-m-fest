const fs = require('fs');
const { Client } = require('pg');

const STAGING_DB = 'postgresql://postgres:m1o2n3u4907273@db.qpuzxoohyzjwdkhbxnjy.supabase.co:5432/postgres';

async function applyMigration() {
  const client = new Client({ connectionString: STAGING_DB });
  try {
    await client.connect();
    const sql = fs.readFileSync('supabase/migrations/169_fix_points_calculation_logic.sql', 'utf8');
    await client.query(sql);
    console.log('✅ Migration 169 applied successfully to Staging DB!');
  } catch (err) {
    console.error('❌ Failed:', err.message);
  } finally {
    await client.end();
  }
}

applyMigration();
