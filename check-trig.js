const {Client} = require('pg');
const c = new Client({connectionString:'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'});
c.connect()
 .then(() => c.query(`SELECT tgname, tgenabled, tgtype, proname FROM pg_trigger JOIN pg_proc ON pg_proc.oid = tgfoid WHERE tgrelid = 'registrations'::regclass`))
 .then(r => console.table(r.rows))
 .catch(console.error)
 .finally(() => c.end());
