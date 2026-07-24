const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Logging in as super admin...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });

  if (authErr) {
    console.error('Login error:', authErr);
    return;
  }
  
  const user = authData.user;
  console.log('Logged in user ID:', user.id);

  console.log('Fetching active festival calendar...');
  const { data: fc, error: fcErr } = await supabase
    .from('festival_calendar')
    .select('*')
    .eq('is_active', true)
    .limit(1);

  if (fcErr) {
    console.error('Error fetching festival:', fcErr);
    return;
  }
  
  if (!fc || fc.length === 0) {
    console.error('No active festival found.');
    return;
  }

  const activeFestivalId = fc[0].id;
  const activeTenantId = fc[0].tenant_id;
  console.log(`Active Festival: ${activeFestivalId}, Tenant: ${activeTenantId}`);

  console.log('Calling get_festival_results RPC...');
  const { data: results, error: rpcErr } = await supabase.rpc('get_festival_results', {
    p_tenant_id: activeTenantId,
    p_festival_id: activeFestivalId
  });

  if (rpcErr) {
    console.error('RPC Error:', rpcErr);
  } else {
    console.log(`RPC returned ${results.length} rows.`);
    console.log(JSON.stringify(results.slice(0, 5), null, 2));
  }
}

run();
