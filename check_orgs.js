module.paths.push('d:\\work\\fest\\web-for-sahi--main\\web-for-sahi--main\\node_modules');
const { Client } = require('pg');

const client = new Client({
  host: 'db.szhwkngspodujiqzblab.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'm1o2n3u4907273',
  database: 'postgres',
});

async function run() {
  await client.connect();
  const res = await client.query(`SELECT id, name FROM organisations WHERE tenant_id = 'f87172d1-ed27-4db4-842c-cc00d3d56de2'`);
  console.log('Organisations:', res.rows);
  await client.end();
}
run();
