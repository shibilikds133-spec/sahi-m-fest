const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres' });
client.connect().then(() => client.query(`SELECT tgname, tgenabled, tgtype, p.proname 
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgrelid = 'public.registrations'::regclass`))
.then(res => console.table(res.rows))
.catch(console.error)
.finally(() => client.end());
