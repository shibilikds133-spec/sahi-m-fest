const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log('SUPABASE_URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Logging in as admin...');
  const { data: auth, error: loginError } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });

  if (loginError) {
    console.error('Login failed:', loginError);
    return;
  }
  console.log('Login successful! Auth user ID:', auth.user.id);

  console.log('Fetching profile for the user...');
  const { data: profileData, error: profileErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id);
  console.log('Profile data:', profileData, 'error:', profileErr);

  console.log('Calling get_my_tenant_id RPC...');
  const { data: myTenantId, error: myTenantIdErr } = await supabase
    .rpc('get_my_tenant_id');
  console.log('get_my_tenant_id:', myTenantId, 'error:', myTenantIdErr);

  console.log('Fetching visible organisations...');
  const { data: visibleOrgs, error: visibleOrgsErr } = await supabase
    .rpc('get_visible_organisations', { p_tenant_id: profileData?.[0]?.tenant_id });
  console.log('Visible organisations count:', visibleOrgs?.length, 'error:', visibleOrgsErr);

  console.log('Fetching participants count...');
  const pCount = await supabase.from('participants').select('id', { count: 'exact', head: true });
  console.log('Count exact/head:', pCount.count, 'error:', pCount.error);

  console.log('Fetching participants list...');
  const { data, error } = await supabase
    .from('participants')
    .select('*, organisations(id, name, org_type)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching participants list:', error);
  } else {
    console.log(`Successfully fetched ${data ? data.length : 0} participants.`);
    if (data && data.length > 0) {
      console.log('First participant:', JSON.stringify(data[0], null, 2));
    }
  }
}

run();
