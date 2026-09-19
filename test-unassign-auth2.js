const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    
    const regId = '041b108a-e298-48b2-accb-74e8885f7d18';
    
    const { rows: u_rows } = await client.query(`
      SELECT p.id 
      FROM profiles p
      JOIN registrations r ON r.tenant_id = p.tenant_id
      WHERE p.role IN ('admin', 'superadmin') AND r.id = $1
      LIMIT 1
    `, [regId]);
    
    if (u_rows.length > 0) {
      const uid = u_rows[0].id;
      console.log('Testing for registration:', regId, 'with uid:', uid);
      
      // Set auth context
      await client.query(`BEGIN;`);
      await client.query(`SELECT set_config('role', 'authenticated', true);`);
      await client.query(`SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true);`, [uid]);
      
      // Call RPC
      const { rows: rpc_rows } = await client.query(`SELECT public.safe_unassign_registration($1, 'test')`, [regId]);
      console.log('RPC result:', rpc_rows[0].safe_unassign_registration);
      
      // Verify it's deleted
      const { rows: check } = await client.query(`SELECT id FROM registrations WHERE id = $1`, [regId]);
      console.log('Exists after RPC?', check.length > 0);
      
      await client.query('ROLLBACK;'); // roll it back so I don't mess up their DB permanently
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
