const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    
    // Find the participant '7a7613ca-5924-45de-a351-d07e05ea1b7d' (from previous logs)
    const { rows } = await client.query(`
      SELECT r.id as reg_id, r.tenant_id as reg_tenant, r.is_verified, 
             p.id as uid, p.role, p.tenant_id as user_tenant
      FROM registrations r
      JOIN profiles p ON p.tenant_id = r.tenant_id
      WHERE r.participant_id = '7a7613ca-5924-45de-a351-d07e05ea1b7d'
      LIMIT 10
    `);
    console.table(rows);
    
    // Also check if there are profiles with team_leader role who can see this
    const { rows: t_rows } = await client.query(`
      SELECT p.id, p.role, p.tenant_id
      FROM profiles p
      WHERE p.role = 'team_leader'
      LIMIT 5
    `);
    console.table(t_rows);
    
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
