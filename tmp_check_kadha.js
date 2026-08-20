require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function checkKadha() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: results, error } = await supabase
    .from('results')
    .select('id, grade, rank, points_awarded, registrations(participant_id, schedules(items(item_name)))');

  if (error) {
    console.error(error);
    return;
  }
  
  for (const r of results) {
    const itemName = r.registrations?.schedules?.items?.item_name || '';
    if (itemName.toLowerCase().includes('kadha') || itemName.toLowerCase().includes('katha')) {
      console.log(`Kadha Result: Rank: ${r.rank} | Grade: ${r.grade} | Points: ${r.points_awarded}`);
    }
  }
}

checkKadha();
