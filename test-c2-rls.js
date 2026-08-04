const { createClient } = require('@supabase/supabase-js');
const url = 'https://szhwkngspodujiqzblab.supabase.co';
const anonKey = 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc';

const supabase = createClient(url, anonKey);

async function runTests2() {
  const { data: d4, error: e4 } = await supabase.from('tenant_provisioning_operations').select('*').limit(1);
  console.log("Table select data length:", d4 ? d4.length : "null", "Error:", e4);

  const { data: d5, error: e5 } = await supabase.from('profiles').update({ role: 'superadmin' }).eq('id', '00000000-0000-0000-0000-000000000000').select();
  console.log("Profile update data length:", d5 ? d5.length : "null", "Error:", e5);
}
runTests2();
