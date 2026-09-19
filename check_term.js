const { Client } = require("pg");
async function run() {
  const client = new Client({ connectionString: "postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres" });
  await client.connect();
  const res = await client.query(`
    SELECT column_name
    FROM information_schema.columns 
    WHERE table_name = 'participants' AND column_name IN ('is_terminated', 'termination_reason');
  `);
  console.log("Columns:", res.rows.map(r => r.column_name));
  
  const rpcRes = await client.query(`
    SELECT proname FROM pg_proc WHERE proname IN ('terminate_participant', 'revoke_termination');
  `);
  console.log("RPCs:", rpcRes.rows.map(r => r.proname));
  await client.end();
}
run();
