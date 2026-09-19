const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    
    // Find a registration that is not verified
    const { rows: r_rows } = await client.query(`
      SELECT r.id, p.id as uid 
      FROM registrations r
      JOIN profiles p ON p.tenant_id = r.tenant_id
      WHERE r.is_verified = false AND p.role IN ('admin', 'admin_leader')
      LIMIT 1
    `);
    
    if (r_rows.length > 0) {
      const regId = r_rows[0].id;
      const uid = r_rows[0].uid;
      console.log('Testing for registration:', regId, 'with uid:', uid);
      
      // Set auth context
      await client.query(`BEGIN;`);
      await client.query(`SELECT set_config('role', 'authenticated', true);`);
      await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true);`, [uid]);
      
      // Call RPC
      const { rows: rpc_rows } = await client.query(`SELECT public.safe_unassign_registration($1, 'test')`, [regId]);
      console.log('RPC result:', rpc_rows[0].safe_unassign_registration);
      
      await client.query(`COMMIT;`); // COMMIT IT!
      
      // Verify it's deleted
      const { rows: check } = await client.query(`SELECT id FROM registrations WHERE id = $1`, [regId]);
      console.log('Exists after RPC?', check.length > 0);
      
    } else {
      console.log('No unverified registration found');
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
