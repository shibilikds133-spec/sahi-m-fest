const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });
  if(authErr) console.log('Auth Error:', authErr);

  const { data: parts, error } = await supabase
    .from('participants')
    .select('id, name, tenant_id, festival_id, unit_org_id')
    .limit(5);

  console.log('Sample participants:', parts);
  console.log('Error:', error);
}
run();
