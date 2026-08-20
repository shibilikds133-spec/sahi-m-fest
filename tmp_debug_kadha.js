require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function debugKadha() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: results, error } = await supabase
    .from('results')
    .select('id, grade, rank, points_awarded, festival_id, item_id, registrations(schedules(items(item_name, participation_type)))');

  if (error) {
    console.error(error);
    return;
  }
  
  for (const r of results) {
    const itemName = r.registrations?.schedules?.items?.item_name || '';
    if (itemName.toLowerCase().includes('kadha') || itemName.toLowerCase().includes('katha')) {
      const { data: rpcOut } = await supabase.rpc('calculate_festival_points', {
        p_festival_id: r.festival_id,
        p_grade: r.grade,
        p_rank: r.rank,
        p_participant_count: 1,
        p_is_group: false,
        p_bracket_override: null
      });
      console.log(`Kadha Result: Rank: ${r.rank} | Grade: ${r.grade} | Points: ${r.points_awarded}`);
      console.log(`RPC returned for 1 participant:`, rpcOut);
      return; // just test one
    }
  }
}

debugKadha();
