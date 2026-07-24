const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('=== SAHI LEADERBOARD DIAGNOSIS ===\n');

  // 1. Login
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });
  if (authErr) { console.error('LOGIN FAILED:', authErr.message); return; }
  console.log('✅ Logged in as:', auth.user.email, '\n');

  // 2. Check festival
  const { data: festivals, error: fcErr } = await supabase
    .from('festival_calendar')
    .select('*')
    .eq('is_active', true);
  if (fcErr) { console.error('❌ festival_calendar error:', fcErr); return; }
  console.log(`✅ Active festivals: ${festivals.length}`);
  festivals.forEach(f => console.log(`   → id: ${f.id}, tenant: ${f.tenant_id}, name: ${f.custom_name || f.festival_year}`));
  
  const festivalId = festivals[0]?.id;
  const tenantId = festivals[0]?.tenant_id;

  // 3. Check results table directly
  const { data: results, error: resErr } = await supabase
    .from('results')
    .select('id, result_status, published, points_awarded, tenant_id, festival_id')
    .eq('published', true);
  if (resErr) { console.error('❌ results table error:', resErr); }
  else {
    console.log(`\n✅ Published results in DB: ${results.length}`);
    const published = results.filter(r => r.result_status === 'published');
    const notPublished = results.filter(r => r.result_status !== 'published');
    console.log(`   → result_status='published': ${published.length}`);
    console.log(`   → result_status!=published: ${notPublished.length}`);
    if (notPublished.length > 0) {
      console.log('   ⚠️  MISMATCH! These rows have published=TRUE but result_status is wrong:');
      notPublished.forEach(r => console.log(`      id: ${r.id}, status: ${r.result_status}`));
    }
  }

  // 4. Test get_festival_results RPC
  console.log('\n--- Testing get_festival_results RPC ---');
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_festival_results', {
    p_tenant_id: tenantId,
    p_festival_id: festivalId
  });
  if (rpcErr) {
    console.error('❌ get_festival_results ERROR:', rpcErr.message);
    console.error('   Code:', rpcErr.code);
  } else {
    console.log(`✅ get_festival_results returned ${rpcData.length} rows`);
    const indiv = rpcData.filter(r => !r.is_group);
    const group = rpcData.filter(r => r.is_group);
    console.log(`   → Individual: ${indiv.length}, Group: ${group.length}`);
    if (rpcData.length > 0) console.log('   Sample:', JSON.stringify(rpcData[0], null, 2));
  }

  // 5. Test get_public_leaderboard RPC
  console.log('\n--- Testing get_public_leaderboard RPC ---');
  const { data: lbData, error: lbErr } = await supabase.rpc('get_public_leaderboard', {
    p_tenant_id: tenantId,
    p_festival_id: festivalId
  });
  if (lbErr) {
    console.error('❌ get_public_leaderboard ERROR:', lbErr.message);
  } else {
    console.log(`✅ get_public_leaderboard returned ${lbData.length} rows`);
    lbData.forEach(r => console.log(`   → ${r.organisation_name}: ${r.total_points} pts`));
  }

  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

run();
