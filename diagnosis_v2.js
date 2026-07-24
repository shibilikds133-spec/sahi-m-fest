const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('=== SAHI LEADERBOARD DIAGNOSIS v2 ===\n');

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });
  if (authErr) { console.error('LOGIN FAILED:', authErr.message); return; }
  console.log('✅ Logged in as:', auth.user.email);
  console.log('   User ID:', auth.user.id, '\n');

  // Check what function body is ACTUALLY in the DB right now
  console.log('--- Checking actual function body in DB ---');
  const { data: funcDef, error: funcErr } = await supabase.rpc('query_function_body', {});
  // This won't work via RPC, skip

  // Try calling with explicit params
  const tenantId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  const festivalId = '550e8400-e29b-41d4-a716-446655440000';

  console.log(`Festival: ${festivalId}`);
  console.log(`Tenant:   ${tenantId}\n`);

  console.log('--- Testing get_festival_results RPC (with explicit params) ---');
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_festival_results', {
    p_tenant_id: tenantId,
    p_festival_id: festivalId
  });
  if (rpcErr) {
    console.error('❌ get_festival_results ERROR:', rpcErr.message);
    console.error('   Code:', rpcErr.code, '\n');
    console.log('⚠️  The OLD function body is still live in Supabase.');
    console.log('   The SQL run in the editor may not have saved correctly.');
  } else {
    console.log(`✅ get_festival_results returned ${rpcData.length} rows`);
    if (rpcData.length > 0) {
      const indiv = rpcData.filter(r => !r.is_group);
      const group = rpcData.filter(r => r.is_group);
      console.log(`   → Individual (is_group=false): ${indiv.length}`);
      console.log(`   → Group (is_group=true): ${group.length}`);
      console.log('\n   Sample row:');
      console.log(JSON.stringify(rpcData[0], null, 2));
    }
  }

  console.log('\n--- Testing get_public_leaderboard RPC ---');
  const { data: lbData, error: lbErr } = await supabase.rpc('get_public_leaderboard', {
    p_tenant_id: tenantId,
    p_festival_id: festivalId
  });
  if (lbErr) {
    console.error('❌ get_public_leaderboard ERROR:', lbErr.message);
  } else {
    console.log(`✅ get_public_leaderboard returned ${lbData.length} rows`);
    lbData.forEach(r => console.log(`   → ${r.organisation_name}: ${r.total_points} pts (${r.result_count} results)`));
  }

  console.log('\n=== DONE ===');
}

run();
