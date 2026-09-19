const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT id, tenant_id FROM festival_calendar ORDER BY festival_year DESC LIMIT 1;
  `);
  const festId = res.rows[0].id;
  const tenantId = res.rows[0].tenant_id;
  
  console.log("Festival ID:", festId);
  console.log("Tenant ID:", tenantId);
  
  const res2 = await client.query(`
    SELECT * FROM get_strategic_publish_order($1, $2);
  `, [festId, tenantId]);
  
  console.table(res2.rows);
  await client.end();
}
run();
