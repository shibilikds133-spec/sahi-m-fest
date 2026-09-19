const fs = require('fs');
const { Client } = require('pg');

const MAIN_DB = 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres';
const STAGING_DB = 'postgresql://postgres:m1o2n3u4907273@db.qpuzxoohyzjwdkhbxnjy.supabase.co:5432/postgres';

const migrationFile = 'supabase/migrations/171_admin_mark_reentry.sql';

async function applyMigration(connectionString, dbName) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log(`\n✅ Connected to ${dbName} DB`);
    const sql = fs.readFileSync(migrationFile, 'utf8');
    console.log(`🔄 Applying ${migrationFile} to ${dbName}...`);
    await client.query(sql);
    console.log(`✅ Successfully applied to ${dbName}!`);
  } catch (err) {
    console.error(`❌ Error on ${dbName}:`, err.message);
  } finally {
    await client.end();
  }
}

async function run() {
  await applyMigration(STAGING_DB, 'STAGING');
  await applyMigration(MAIN_DB, 'MAIN');
}

run();
