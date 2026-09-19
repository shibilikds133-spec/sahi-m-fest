const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    
    const { rows } = await client.query(`
      SELECT p.id, p.role, p.tenant_id as pt, o.tenant_id as ot, o.id as org_id 
      FROM profiles p 
      JOIN organisations o ON p.organisation_id = o.id 
      WHERE p.role = 'team_leader' 
      LIMIT 5
    `);
    console.table(rows);
    
  } catch(e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
main();
