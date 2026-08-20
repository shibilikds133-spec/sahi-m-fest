const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });

  const tenantId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  
  const { data: festival } = await supabase
    .from('festival_calendar')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();

  if(!festival) return console.log('no festival');

  const participantsResult = await supabase
    .from('participants')
    .select('id, name, chest_number, category_code, organisation_id')
    .eq('festival_id', festival.id)
    .order('name');
    
  console.log('Participants Result:', participantsResult);
}
run();
