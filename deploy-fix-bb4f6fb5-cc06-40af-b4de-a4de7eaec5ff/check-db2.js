const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.szhwkngspodujiqzblab:m1o2n3u4907273@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function verify() {
  try {
    await client.connect();
    
    // 1. tenants.access_disabled exists with correct default
    const res1 = await client.query(`
      SELECT column_name, column_default, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tenants' AND column_name = 'access_disabled'
    `);
    console.log("tenants.access_disabled:", res1.rows[0]);

    // 2. organisations.archived_at exists
    const res2 = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'organisations' AND column_name = 'archived_at'
    `);
    console.log("organisations.archived_at:", res2.rows[0]);

    // 3. tenant_access_audit_logs exists
    const res3 = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'tenant_access_audit_logs'
    `);
    console.log("tenant_access_audit_logs exists:", res3.rows.length > 0);

    // 4. Verify grants (PUBLIC and anon cannot execute privileged C3 RPCs)
    const rpcs = ['disable_tenant_access', 'enable_tenant_access', 'archive_child_organisation', 'restore_child_organisation', 'revoke_tenant_access', 'delete_child_organisation', 'get_my_access_status'];
    for (const rpc of rpcs) {
      const g = await client.query(`
        SELECT grantee, privilege_type 
        FROM information_schema.routine_privileges 
        WHERE routine_name = $1 AND grantee IN ('PUBLIC', 'anon')
      `, [rpc]);
      if (g.rows.length > 0) {
        console.log(`WARNING: ${rpc} has PUBLIC/anon grants!`, g.rows);
      } else {
        console.log(`${rpc} has NO PUBLIC/anon grants (Safe)`);
      }
    }

    // Check last migrations
    const resM = await client.query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 3');
    console.log("Last migrations in DB:", resM.rows.map(r => r.version));

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
verify();
