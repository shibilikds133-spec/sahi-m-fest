const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  const client = new Client({
    connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
  });

  try {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, 'supabase/migrations/166_add_grace_marks_system.sql'), 'utf8');
    
    // We can run the whole file at once using simple query (which supports multiple statements)
    await client.query(sql);
    console.log('Migration successfully applied to production!');
  } catch (err) {
    console.error('Error applying migration:', err);
  } finally {
    await client.end();
  }
}

applyMigration();
