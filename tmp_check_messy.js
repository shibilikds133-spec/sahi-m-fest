require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function checkPoints() {
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
  
  let messy = 0;
  for (const r of results) {
    if ((r.grade || r.rank) && r.points_awarded === 0) {
      console.log(`Messy (0 points): ${r.registrations?.schedules?.items?.item_name} | Rank: ${r.rank} | Grade: ${r.grade} | Points: ${r.points_awarded}`);
      messy++;
    } else if (r.points_awarded === null && (r.grade || r.rank)) {
      console.log(`Messy (Null points): ${r.registrations?.schedules?.items?.item_name} | Rank: ${r.rank} | Grade: ${r.grade} | Points: ${r.points_awarded}`);
      messy++;
    } else if (r.grade || r.rank) {
      console.log(`Good: ${r.registrations?.schedules?.items?.item_name} | Rank: ${r.rank} | Grade: ${r.grade} | Points: ${r.points_awarded}`);
    }
  }

  console.log(`Found ${messy} messy results out of ${results.length} total results.`);
}

checkPoints();
