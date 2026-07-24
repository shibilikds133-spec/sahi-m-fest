const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('=== DEEP HIERARCHY INVESTIGATION ===\n');

  const { data: auth } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });
  console.log('✅ Logged in\n');

  const tenantId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  const festivalId = '550e8400-e29b-41d4-a716-446655440000';

  // 1. Get all 8 published results directly
  console.log('--- All published results (raw) ---');
  const { data: results } = await supabase
    .from('results')
    .select('id, tenant_id, festival_id, registration_id, result_status, published, points_awarded')
    .eq('published', true);
  console.log(`Total published: ${results.length}`);
  results.forEach(r => {
    console.log(`  result_id: ${r.id}`);
    console.log(`    tenant_id: ${r.tenant_id}`);
    console.log(`    festival_id: ${r.festival_id}`);
    console.log(`    registration_id: ${r.registration_id}`);
    console.log(`    status: ${r.result_status}, points: ${r.points_awarded}`);
  });

  console.log('\n--- Checking tenant IDs ---');
  console.log(`Festival tenant_id (sector): ${tenantId}`);
  const uniqueTenants = [...new Set(results.map(r => r.tenant_id))];
  console.log(`Result tenant_ids found: ${JSON.stringify(uniqueTenants)}`);

  const directMatch = results.filter(r => r.tenant_id === tenantId);
  console.log(`Direct tenant match (res.tenant_id = festival tenant): ${directMatch.length}`);

  const festivalMatch = results.filter(r => r.festival_id === festivalId);
  console.log(`Festival ID match: ${festivalMatch.length}`);

  // 2. Check registrations
  console.log('\n--- Registrations for these results ---');
  const regIds = results.map(r => r.registration_id).filter(Boolean);
  if (regIds.length > 0) {
    const { data: regs } = await supabase
      .from('registrations')
      .select('id, organisation_id, tenant_id')
      .in('id', regIds);
    console.log(`Found ${regs?.length || 0} registrations`);
    regs?.forEach(reg => {
      console.log(`  reg_id: ${reg.id}`);
      console.log(`    org_id: ${reg.organisation_id}`);
      console.log(`    tenant_id: ${reg.tenant_id}`);
    });
  } else {
    console.log('⚠️  No registration_ids in results!');
  }

  // 3. Check organisations
  console.log('\n--- All organisations (first 10) ---');
  const { data: orgs } = await supabase
    .from('organisations')
    .select('id, name, org_type, tenant_id, parent_id')
    .limit(10);
  orgs?.forEach(o => {
    console.log(`  ${o.name} (${o.org_type})`);
    console.log(`    id: ${o.id}`);
    console.log(`    tenant_id: ${o.tenant_id}`);
    console.log(`    parent_id: ${o.parent_id}`);
  });

  // 4. Check which orgs match our tenant
  const orgsMatchingTenant = orgs?.filter(o => o.tenant_id === tenantId);
  console.log(`\nOrgs with tenant_id = sector (${tenantId}): ${orgsMatchingTenant?.length}`);
  orgsMatchingTenant?.forEach(o => console.log(`  → ${o.name} (id: ${o.id})`));

  // 5. Try RPC with NULL tenant
  console.log('\n--- Testing get_festival_results with NULL tenant (no filter) ---');
  const { data: rpcNullTenant, error: e1 } = await supabase.rpc('get_festival_results', {
    p_tenant_id: null,
    p_festival_id: festivalId
  });
  if (e1) console.error('❌ Error with null tenant:', e1.message);
  else console.log(`✅ With null tenant: ${rpcNullTenant.length} rows returned`);

  // 6. Try RPC with only festival
  console.log('\n--- Testing get_festival_results with NULL both ---');
  const { data: rpcNull, error: e2 } = await supabase.rpc('get_festival_results', {
    p_tenant_id: null,
    p_festival_id: null
  });
  if (e2) console.error('❌ Error:', e2.message);
  else console.log(`✅ With null both: ${rpcNull.length} rows returned`);

  console.log('\n=== DONE ===');
}

run();
