const fs = require('fs');
const { Client } = require('pg');

// MAIN PRODUCTION DB
const MAIN_DB = 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres';

const migrations = [
  'supabase/migrations/167_suspense_publisher_plugin.sql',
  'supabase/migrations/168_participant_team_transfer.sql',
  'supabase/migrations/169_fix_points_calculation_logic.sql',
];

async function applyMigrations() {
  const client = new Client({ connectionString: MAIN_DB });
  try {
    await client.connect();
    console.log('✅ Connected to Main Production DB');
    for (const file of migrations) {
      const sql = fs.readFileSync(file, 'utf8');
      console.log(`\n🔄 Applying: ${file}...`);
      await client.query(sql);
      console.log(`✅ Done: ${file}`);
    }
    console.log('\n🎉 All migrations applied to MAIN DB successfully!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

applyMigrations();
