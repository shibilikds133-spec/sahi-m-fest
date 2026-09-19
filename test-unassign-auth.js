const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    
    // We will simulate a user session
    const { rows: u_rows } = await client.query(`SELECT id FROM profiles WHERE role IN ('admin', 'superadmin') LIMIT 1`);
    if (u_rows.length > 0) {
      const uid = u_rows[0].id;
      
      // Let's insert a fake registration to test delete
      // First get a participant and an item
      const { rows: p_rows } = await client.query(`SELECT id, tenant_id, festival_id, organisation_id FROM participants LIMIT 1`);
      const { rows: i_rows } = await client.query(`SELECT id FROM items LIMIT 1`);
      
      if (p_rows.length > 0 && i_rows.length > 0) {
        const p = p_rows[0];
        const item_id = i_rows[0].id;
        
        const { rows: r_ins } = await client.query(`
          INSERT INTO registrations (tenant_id, festival_id, item_id, participant_id, status, is_group_registration, level, organisation_id, is_verified)
          VALUES ($1, $2, $3, $4, 'pending', false, 'unit', $5, false)
          RETURNING id
        `, [p.tenant_id, p.festival_id, item_id, p.id, p.organisation_id]);
        
        const regId = r_ins[0].id;
        console.log('Inserted fake registration:', regId);
        
        // Set auth context
        await client.query(`
          BEGIN;
          SELECT set_config('role', 'authenticated', true);
          SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, true);
        `, [uid]);
        
        // Call RPC
        const { rows: rpc_rows } = await client.query(`SELECT public.safe_unassign_registration($1, 'test')`, [regId]);
        console.log('RPC result:', rpc_rows[0].safe_unassign_registration);
        
        // Verify it's deleted
        const { rows: check } = await client.query(`SELECT id FROM registrations WHERE id = $1`, [regId]);
        console.log('Exists after RPC?', check.length > 0);
        
        await client.query('COMMIT;');
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
