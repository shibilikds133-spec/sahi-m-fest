require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const tenantId = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';
  const { data } = await s.from('festival_calendar').select('id, custom_name, is_active').eq('tenant_id', tenantId);
  console.log(data);
  const { data: st } = await s.from('festival_leaderboard_settings').select('*').eq('tenant_id', tenantId);
  console.log('settings', st);
}
run();
