const { Client } = require('pg');

const MAIN_DB = 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres';
const STAGING_DB = 'postgresql://postgres:m1o2n3u4907273@db.qpuzxoohyzjwdkhbxnjy.supabase.co:5432/postgres';
const TENANT_ID = 'f247b04f-a6d0-4b36-896d-efae2b7e3b30'; // test-alviora

const TABLES = [
  'tenants',
  'festivals',
  'item_categories',
  'items',
  'organisations',
  'participants',
  'registrations',
  'code_letters',
  'schedules',
  'judges',
  'judge_assignments',
  'marks',
  'results'
];

async function migrate() {
  const mainClient = new Client({ connectionString: MAIN_DB });
  const stagingClient = new Client({ connectionString: STAGING_DB });

  try {
    console.log("Connecting...");
    await mainClient.connect();
    await stagingClient.connect();

    console.log("Disabling FK checks on Staging...");
    await stagingClient.query(`SET session_replication_role = 'replica';`);

    for (const table of TABLES) {
      console.log(`Copying table: ${table}...`);
      
      // We will select rows for this tenant. 
      // For some tables, tenant_id might not exist directly, but for most in this system, it does.
      let query = `SELECT * FROM ${table} WHERE tenant_id = $1`;
      
      // Let's check if tenant_id exists on this table
      const colCheck = await mainClient.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = 'tenant_id'
      `, [table]);

      if (colCheck.rows.length === 0) {
        if (table === 'tenants') {
           query = `SELECT * FROM tenants WHERE id = $1`;
        } else {
           console.log(`Skipping ${table} (no tenant_id)`);
           continue;
        }
      }

      const { rows } = await mainClient.query(query, [TENANT_ID]);
      console.log(`Found ${rows.length} rows in ${table}.`);

      if (rows.length === 0) continue;

      const stagingColsRes = await stagingClient.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      const stagingCols = new Set(stagingColsRes.rows.map(r => r.column_name));

      // Insert rows into Staging (only columns that exist in both)
      const allKeys = Object.keys(rows[0]);
      const keys = allKeys.filter(k => stagingCols.has(k));
      const cols = keys.map(k => `"${k}"`).join(', ');
      
      for (const row of rows) {
        const values = keys.map((_, i) => `$${i + 1}`).join(', ');
        const insertQuery = `INSERT INTO ${table} (${cols}) VALUES (${values}) ON CONFLICT DO NOTHING;`;
        
        const rowVals = keys.map(k => row[k]);
        await stagingClient.query(insertQuery, rowVals);
      }
      console.log(`Finished copying ${table}.`);
    }

    console.log("Re-enabling FK checks on Staging...");
    await stagingClient.query(`SET session_replication_role = 'origin';`);
    console.log("Migration complete!");

  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await mainClient.end();
    await stagingClient.end();
  }
}

migrate();
