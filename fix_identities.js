const { Client } = require('pg');
const client = new Client('postgresql://postgres:m1o2n3u4907273@db.qpuzxoohyzjwdkhbxnjy.supabase.co:5432/postgres');
client.connect().then(() => {
  client.query("UPDATE auth.identities SET provider_id = user_id::text WHERE provider = 'email' AND provider_id != user_id::text", (err, res) => {
    console.log('Update:', err ? err.message : res.rowCount);
    client.end();
  });
}).catch(console.error);
