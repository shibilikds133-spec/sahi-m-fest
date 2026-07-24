const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Logging in as Kodasseri Sector Admin (simulate session)...');
  // Let's find the email of the Kodasseri Admin from profiles
  // We saw full_name: 'Kodasseri North Admin', full_name: 'Kodasseri South Admin'
  // Let's login as shibilikds938@gmail.com first and query profiles to find a sector admin email or just query registrations with anon key if RLS allows it (or login as admin first)
  const { data: auth, error: loginError } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });

  if (loginError) {
    console.error('Login failed:', loginError);
    return;
  }

  // Let's find the profiles
  const { data: profiles } = await supabase.from('profiles').select('*');
  const sectorAdminProfile = profiles.find(p => p.full_name && p.full_name.toLowerCase().includes('kodasseri'));
  console.log('Sector admin profile:', sectorAdminProfile);

  // Since we are logged in as superadmin shibilikds938@gmail.com (is_superadmin: true, tenant_id: null),
  // RLS lets us see everything!
  // If we query registrations without tenant_id filter:
  const { data: regsAll, error: errAll } = await supabase
    .from('registrations')
    .select('id, item_id, status, is_verified, code_letter');

  console.log(`Query without tenant_id returned ${regsAll ? regsAll.length : 0} rows. Error:`, errAll);

  // If we filter where tenant_id in (select id from tenants where parent/etc):
  // Let's print unique tenant_ids of registrations
  if (regsAll) {
    const uniqueTenants = [...new Set(regsAll.map(r => r.tenant_id))];
    console.log('Unique tenants in registrations:', uniqueTenants);
  }
}

run();
