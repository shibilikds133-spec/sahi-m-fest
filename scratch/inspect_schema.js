const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:m1o2n3u4907273@db.szhwkngspodujiqzblab.supabase.co:5432/postgres'
  });
  await client.connect();
  
  console.log('Adding column public.file_metadata.metadata...');
  await client.query(`
    ALTER TABLE public.file_metadata 
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
  `);
  console.log('Column metadata added successfully!');
  
  await client.end();
}
run().catch(console.error);
