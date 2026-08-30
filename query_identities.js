const { Client } = require('pg');
const client = new Client('postgresql://postgres:m1o2n3u4907273@db.qpuzxoohyzjwdkhbxnjy.supabase.co:5432/postgres');
client.connect().then(() => {
  client.query("SELECT * FROM auth.identities", (err, res) => {
    console.log('Identities:', err ? err.message : res.rows);
    client.end();
  });
}).catch(console.error);
