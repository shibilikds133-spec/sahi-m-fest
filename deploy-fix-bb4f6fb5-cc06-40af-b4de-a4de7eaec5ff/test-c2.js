const { createClient } = require('@supabase/supabase-js');
const url = 'https://szhwkngspodujiqzblab.supabase.co';
const anonKey = 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc';

const supabase = createClient(url, anonKey);
const edgeFunctionUrl = `${url}/functions/v1/provision-admin`;

async function runTests() {
  console.log("=== C2 ONBOARDING RUNTIME VERIFICATION ===");
  
  // 1. Anonymous Edge Function Test
  try {
    const res = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'status', idempotency_key: 'test1' })
    });
    const data = await res.json();
    console.log("1. Anonymous Test status:", res.status);
    console.log("   Anonymous Test response:", JSON.stringify(data));
  } catch (e) {
    console.error("1. Anonymous Test failed:", e.message);
  }

  // 2. Invalid JWT Test
  try {
    const res = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.jwt'
      },
      body: JSON.stringify({ operation: 'status', idempotency_key: 'test2' })
    });
    const data = await res.json();
    console.log("2. Invalid JWT Test status:", res.status);
    console.log("   Invalid JWT Test response:", JSON.stringify(data));
  } catch (e) {
    console.error("2. Invalid JWT Test failed:", e.message);
  }

  // 3. Direct RPC Bypass Test
  const { error: rpcError1 } = await supabase.rpc('finalise_tenant_provisioning', {});
  console.log("3. Direct RPC finalise_tenant_provisioning (anon):", rpcError1 ? rpcError1.message : "SUCCESS (UNSAFE)");

  const { error: rpcError2 } = await supabase.rpc('setup_child_organisation', {});
  console.log("3. Direct RPC setup_child_organisation (anon):", rpcError2 ? rpcError2.message : "SUCCESS (UNSAFE)");

  const { error: rpcError3 } = await supabase.rpc('record_provisioning_event', {});
  console.log("3. Direct RPC record_provisioning_event (anon):", rpcError3 ? rpcError3.message : "SUCCESS (UNSAFE)");

  const { error: rpcError4 } = await supabase.rpc('_provisioning_get_org', {});
  console.log("3. Direct RPC _provisioning_get_org (anon):", rpcError4 ? rpcError4.message : "SUCCESS (UNSAFE)");

  // 4. Provisioning Table Access
  const { error: tableError } = await supabase.from('tenant_provisioning_operations').select('*').limit(1);
  console.log("4. Table tenant_provisioning_operations (anon) select:", tableError ? tableError.message : "SUCCESS (UNSAFE)");

  // 5. Profile Escalation
  const { error: profError } = await supabase.from('profiles').update({ role: 'superadmin' }).eq('id', '00000000-0000-0000-0000-000000000000');
  console.log("5. Profile update (anon):", profError ? profError.message : "SUCCESS (UNSAFE)");

}
runTests();
