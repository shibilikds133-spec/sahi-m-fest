const { Client } = require('pg');
require('dotenv').config({ path: '.env.staging' });

const STAGING_DB = 'postgresql://postgres:m1o2n3u4907273@db.qpuzxoohyzjwdkhbxnjy.supabase.co:5432/postgres';

async function fetchConfig() {
  const client = new Client({ connectionString: STAGING_DB });
  try {
    await client.connect();
    const res = await client.query('SELECT * FROM points_config LIMIT 1');
    console.log(JSON.stringify(res.rows[0], null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

fetchConfig();
