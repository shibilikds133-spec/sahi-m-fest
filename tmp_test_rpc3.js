require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function testRpc() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: config } = await supabase
    .from('points_config')
    .select('festival_id')
    .order('config_version', { ascending: false })
    .limit(1)
    .single();

  const { data: rpcOut } = await supabase.rpc('calculate_festival_points', {
    p_festival_id: config.festival_id,
    p_grade: 'A',
    p_rank: 3,
    p_participant_count: 1,
    p_is_group: false,
    p_bracket_override: null
  });

  console.log(rpcOut);
}

testRpc();
