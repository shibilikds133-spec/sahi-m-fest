require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function fixSchedules() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: schedules, error } = await supabase
    .from('schedules')
    .select('id, official_participant_bracket, items(participation_type)')
    .not('official_participant_bracket', 'is', null);
    
  if (error) {
    console.error(error);
    return;
  }
  
  const singleIds = schedules
    .filter(s => s.items?.participation_type === 'individual')
    .map(s => s.id);
    
  if (singleIds.length === 0) {
    console.log("No single items have a bracket override. All good.");
    return;
  }
  
  console.log(`Clearing bracket override for ${singleIds.length} single item schedules...`);
  
  const { error: updateError } = await supabase
    .from('schedules')
    .update({ official_participant_bracket: null })
    .in('id', singleIds);
    
  if (updateError) {
    console.error("Failed to update schedules:", updateError);
  } else {
    console.log("Successfully cleared bracket overrides for single items!");
  }
}

fixSchedules();
