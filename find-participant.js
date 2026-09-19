const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });

async function main() {
  await client.connect();
  const { rows } = await client.query(`
    SELECT r.participant_id, count(*)
    FROM registrations r
    JOIN items i ON r.item_id = i.id
    WHERE i.item_name_en IN ('b', 'MMMMMMMMMMMMM', 'NNN', 'madh song')
    GROUP BY r.participant_id
    HAVING count(*) >= 2
  `);
  console.log('Found participants:', rows);
  
  if (rows.length > 0) {
    const pid = rows[0].participant_id;
    const { rows: regs } = await client.query(`
      SELECT r.id as reg_id, r.tenant_id, i.item_name_en, r.organisation_id
      FROM registrations r
      JOIN items i ON r.item_id = i.id
      WHERE r.participant_id = $1
    `, [pid]);
    console.table(regs);
  }
  await client.end();
}
main();
