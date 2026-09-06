require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const tenantId = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';
  
  const { data: festivalData } = await supabase
    .from('festival_calendar')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();
    
  console.log('Festival:', festivalData);
  
  if (festivalData) {
    const { data: lbData, error } = await supabase.rpc('get_public_leaderboard', {
      p_tenant_id: tenantId,
      p_festival_id: festivalData.id
    });
    console.log('Leaderboard length:', lbData?.length, 'error:', error);
    if (lbData) console.log(lbData.slice(0, 3));
  }
}
check();
