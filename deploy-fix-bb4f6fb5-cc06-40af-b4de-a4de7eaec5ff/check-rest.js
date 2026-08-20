const { createClient } = require('@supabase/supabase-js');
const url = 'https://szhwkngspodujiqzblab.supabase.co';
const key = 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc';

const supabase = createClient(url, key);

async function testREST() {
  // Try querying tenants access_disabled
  const { data: tData, error: tErr } = await supabase.from('tenants').select('id, access_disabled').limit(1);
  console.log("Tenants check:", tErr ? tErr.message : "Success");

  // Try querying organisations archived_at
  const { data: oData, error: oErr } = await supabase.from('organisations').select('id, archived_at').limit(1);
  console.log("Organisations check:", oErr ? oErr.message : "Success");

  // Try calling the new RPCs with anon key
  const { error: r1 } = await supabase.rpc('disable_tenant_access', { p_org_id: '00000000-0000-0000-0000-000000000000' });
  console.log("Anon call disable_tenant_access:", r1 ? r1.message : "Success");
}
testREST();
