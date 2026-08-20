const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function verifyGrants() {
  try {
    await client.connect();
    console.log("Connected to DB to verify grants...");

    const rpcs = [
      '_assert_import_access',
      'execute_junior_import_chunk',
      'execute_senior_import_chunk',
      'execute_upper_primary_import_chunk',
      'execute_lp_import_chunk',
      'execute_hs_import_chunk',
      'execute_hss_import_chunk',
      'execute_general_import_chunk',
      'execute_schedule_import_chunk'
    ];

    for (const rpc of rpcs) {
      const res = await client.query(`
        SELECT p.proname, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) as acl
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = $1
      `, [rpc]);
      
      const grants = res.rows.map(r => {
        // aclexplode returns record (grantor oid, grantee oid, privilege_type text, is_grantable boolean)
        // grantee 0 usually means PUBLIC
        return r.acl;
      });

      // We actually need grantee names. Let's do a better query.
      const res2 = await client.query(`
        SELECT grantee, privilege_type
        FROM information_schema.routine_privileges
        WHERE routine_schema = 'public' AND routine_name = $1
      `, [rpc]);
      
      console.log(`Grants for ${rpc}:`);
      console.log(res2.rows);
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
verifyGrants();
