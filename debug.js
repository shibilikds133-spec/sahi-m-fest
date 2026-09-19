const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: festival } = await supabase.from('festival_calendar').select('id, tenant_id').eq('is_active', true).limit(1).single();
  console.log("Festival:", festival);
  
  const { data: settings } = await supabase.from('festival_leaderboard_settings').select('*').eq('festival_id', festival.id).single();
  console.log("Leaderboard settings:", settings);

  const { data: results, error } = await supabase.rpc('get_public_published_results', {
    p_tenant_id: festival.tenant_id,
    p_festival_id: festival.id,
    p_include_participant_details: true
  });
  console.log("Published results count:", results?.length, "Error:", error);
}
check();
