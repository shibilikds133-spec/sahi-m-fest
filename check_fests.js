const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the private environment.');
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
async function run() {
  const { data: orgs } = await supabase.from('organisations').select('tenant_id').in('name', ['Gloria', 'Victoria', 'Aurelia']);
  console.log('Orgs tenants:', [...new Set(orgs.map(o => o.tenant_id))]);
}
run().catch(console.error);
