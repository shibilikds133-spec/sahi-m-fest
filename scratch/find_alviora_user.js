const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (users && users.users) {
    const { data: profiles } = await supabase.from('profiles').select('id, email, tenant_id').eq('tenant_id', 'f87172d1-ed27-4db4-842c-cc00d3d56de2');
    console.log('Profiles for Alviora,:', profiles);
  }
}
run();
