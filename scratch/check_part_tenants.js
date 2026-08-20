const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });

  const fests = [
    '7ebe465a-8c64-4366-8faa-d04ff5d4b3d7', // Alviora,
    'e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6', // Kodasseri
    '9f172bb9-1dc1-4950-9302-e95028f6219d' // ALVIORA (0)
  ];

  for (const fid of fests) {
    const { data: fest } = await supabase.from('festival_calendar').select('custom_name, tenant_id').eq('id', fid).single();
    if(!fest) continue;
    
    const { data: parts } = await supabase.from('participants').select('tenant_id').eq('festival_id', fid).limit(10);
    console.log(`Fest ${fest.custom_name} tenant_id: ${fest.tenant_id}`);
    console.log(`Participants tenant_ids:`, parts ? parts.map(p => p.tenant_id) : 'none');
  }
}
run();
