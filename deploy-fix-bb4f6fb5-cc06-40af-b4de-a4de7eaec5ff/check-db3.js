const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.szhwkngspodujiqzblab:m1o2n3u4907273@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres'
});

async function verify() {
  try {
    await client.connect();

    // 1. Table
    const res1 = await client.query(`
      SELECT table_name, rowsecurity
      FROM pg_tables 
      WHERE tablename = 'tenant_provisioning_operations'
    `);
    console.log("tenant_provisioning_operations:", res1.rows);

    // 2. RPC Signatures & Grants
    const rpcs = await client.query(`
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'public' 
      AND p.proname IN ('setup_tenant_records', 'setup_child_organisation', 'finalise_tenant_provisioning', 'finalise_child_organisation_provisioning', '_provisioning_upsert_op', 'record_provisioning_event')
    `);
    console.log("RPC Signatures:", rpcs.rows);

    // 3. Grants for PUBLIC/anon
    const grants = await client.query(`
      SELECT routine_name, grantee, privilege_type 
      FROM information_schema.routine_privileges 
      WHERE routine_name IN ('setup_tenant_records', 'setup_child_organisation', 'finalise_tenant_provisioning', 'finalise_child_organisation_provisioning', '_provisioning_upsert_op', 'record_provisioning_event')
      AND grantee IN ('PUBLIC', 'anon')
    `);
    console.log("PUBLIC/anon grants (should be empty):", grants.rows);

    // 4. Grants for authenticated
    const authGrants = await client.query(`
      SELECT routine_name, grantee, privilege_type 
      FROM information_schema.routine_privileges 
      WHERE routine_name IN ('setup_tenant_records', 'setup_child_organisation', 'finalise_tenant_provisioning', 'finalise_child_organisation_provisioning', '_provisioning_upsert_op', 'record_provisioning_event')
      AND grantee = 'authenticated'
    `);
    console.log("authenticated grants:", authGrants.rows);

    // 5. RLS Policies on profiles
    const pols = await client.query(`
      SELECT policyname, permissive, roles, cmd 
      FROM pg_policies 
      WHERE tablename = 'profiles'
    `);
    console.log("Profiles policies:", pols.rows);

    // 6. Trigger handle_new_user default role
    const trig = await client.query(`
      SELECT prosrc 
      FROM pg_proc 
      WHERE proname = 'handle_new_user'
    `);
    console.log("handle_new_user trigger source contains 'participant':", trig.rows[0].prosrc.includes('participant'));

  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
verify();
