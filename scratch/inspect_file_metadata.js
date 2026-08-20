const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://szhwkngspodujiqzblab.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6aHdrbmdzcG9kdWppcXpibGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk0NTExMywiZXhwIjoyMDkxNTIxMTEzfQ.AA6_F8z223C7DX07KtntvqzowF-y4OVGRjTt5VCTeEw'
);

async function run() {
  const res = await supabase.from('file_metadata').select('metadata').limit(1);
  console.log('metadata select result:', JSON.stringify(res));
}
run().catch(console.error);
