require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function analyzeResults() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: results, error } = await supabase
    .from('results')
    .select('id, grade, rank, points_awarded, is_published, registrations(participant_id, schedules(official_participant_bracket, items(item_name, participation_type)))')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }
  
  console.log(`Found ${results.length} total results.`);

  for (const r of results) {
    if (!r.grade && !r.rank) continue; // skip empty
    const schedule = r.registrations?.schedules;
    const itemName = schedule?.items?.item_name;
    const isGroup = schedule?.items?.participation_type === 'group';
    console.log(`- Item: ${itemName} (Group: ${isGroup}) | Rank: ${r.rank} | Grade: ${r.grade} | Points: ${r.points_awarded} | Published: ${r.is_published} | BracketOverride: ${schedule?.official_participant_bracket}`);
  }
}

analyzeResults();
