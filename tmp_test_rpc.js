require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function testRpc() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: festival } = await supabase.from('festivals').select('id').limit(1).single();

  const { data: calculatedPoints, error: rpcError } = await supabase.rpc('calculate_festival_points', {
    p_festival_id: festival.id,
    p_grade: 'A+',
    p_rank: 1,
    p_participant_count: 1,
    p_is_group: false,
    p_bracket_override: null
  });

  console.log(calculatedPoints);
}

testRpc();
