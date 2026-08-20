const fs = require('fs');
const envStr = fs.readFileSync('c:/Users/hp/Downloads/web-for-sahi--main (1)/web-for-sahi--main/.env.local', 'utf8');
const urlLine = envStr.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_URL='));
const keyLine = envStr.split('\n').find(l => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY='));

const url = urlLine.split('=')[1].trim().replace(/["']/g, '');
const key = keyLine.split('=')[1].trim().replace(/["']/g, '');

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(url, key);

async function run() {
  const { data: f } = await supabase.from('festivals').select('id, tenant_id').limit(1).single();
  const { data: count, error } = await supabase
    .from('registrations')
    .select('*', { count: 'exact' })
    .eq('festival_id', f.id)
    .eq('general_division', 'GENERAL');
    
  console.log('Existing General Regs:', count.length);
  if (count.length > 0) {
      console.log('They are already imported!');
  }
}
run();
