const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    
    // Find the participant ID for NNN
    const { rows: r_rows } = await client.query(`
      SELECT r.id, i.item_name_en, p.name
      FROM registrations r
      JOIN items i ON i.id = r.item_id
      JOIN participants p ON p.id = r.participant_id
      WHERE i.item_name_en = 'NNN'
      LIMIT 1
    `);
    
    if (r_rows.length > 0) {
      const regId = r_rows[0].id;
      console.log('Testing for registration:', regId, r_rows[0].item_name_en, 'Participant:', r_rows[0].name);
      
      // Need to find an admin user to spoof auth.uid()
      const { rows: u_rows } = await client.query(`SELECT id FROM profiles WHERE role IN ('admin', 'superadmin', 'team_leader') LIMIT 1`);
      if (u_rows.length > 0) {
        const uid = u_rows[0].id;
        await client.query(`
          CREATE OR REPLACE FUNCTION public.set_auth_uid(uid uuid) RETURNS void AS $$
          BEGIN
            PERFORM set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
          END;
          $$ LANGUAGE plpgsql;
        `);
        await client.query(`SELECT public.set_auth_uid($1)`, [uid]);
        
        // Now call it
        const { rows: rpc_rows } = await client.query(`SELECT public.safe_unassign_registration($1, 'test')`, [regId]);
        console.log('RPC result:', rpc_rows[0].safe_unassign_registration);
      }
    } else {
      console.log('No registration found');
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
