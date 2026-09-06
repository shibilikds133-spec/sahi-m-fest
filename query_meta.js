const { Client } = require('pg');
const client = new Client('postgresql://postgres:m1o2n3u4907273@db.qpuzxoohyzjwdkhbxnjy.supabase.co:5432/postgres');
client.connect().then(() => {
  client.query("SELECT id, raw_app_meta_data, raw_user_meta_data FROM auth.users WHERE id = '1cf92194-14f6-4392-b537-53ea8781dfc0'", (err, res) => {
    console.log('Metadata:', err ? err.message : res.rows);
    client.end();
  });
}).catch(console.error);
