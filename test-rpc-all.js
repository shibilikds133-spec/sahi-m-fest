const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
});

async function main() {
  try {
    await client.connect();
    
    // The two festivals that have unpublished results
    const festivals = [
      'de289845-e465-4c7e-a470-820412156202',
      '7ebe465a-8c64-4366-8faa-d04ff5d4b3d7'
    ];
    
    for (const f_id of festivals) {
      console.log(`\nCalling RPC for festival: ${f_id}`);
      // Find tenant_id
      const { rows: t_rows } = await client.query('SELECT tenant_id FROM festival_calendar WHERE id = $1', [f_id]);
      if (!t_rows.length) { console.log('No tenant found'); continue; }
      
      const t_id = t_rows[0].tenant_id;
      const { rows } = await client.query('SELECT * FROM get_strategic_publish_order($1, $2)', [f_id, t_id]);
      console.log(`Returned ${rows.length} records.`);
      if (rows.length > 0) {
        console.log(rows);
      }
    }
  } catch(e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}
main();
