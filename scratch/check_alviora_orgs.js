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

  const tenantId = 'f87172d1-ed27-4db4-842c-cc00d3d56de2'; // Alviora, tenant
  const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
  console.log('Alviora Tenant:', tenant);

  const { data: parts } = await supabase.from('participants').select('organisation_id').eq('festival_id', '7ebe465a-8c64-4366-8faa-d04ff5d4b3d7').limit(10);
  console.log('Participants org_ids:', parts.map(p => p.organisation_id));
}
run();
