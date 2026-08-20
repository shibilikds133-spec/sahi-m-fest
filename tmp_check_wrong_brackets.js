require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function checkSchedules() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data, error } = await supabase
    .from('schedules')
    .select('id, official_participant_bracket, items(item_name_en, participation_type)')
    .not('official_participant_bracket', 'is', null);
    
  if (error) {
    console.error(error);
    return;
  }
  
  const singleWithBracket = data.filter(s => s.items?.participation_type === 'individual');
  
  console.log(`Total schedules with bracket override: ${data.length}`);
  console.log(`Single items with bracket override: ${singleWithBracket.length}`);
  
  singleWithBracket.forEach(s => {
    console.log(`- ${s.items?.item_name_en}: Bracket ${s.official_participant_bracket}`);
  });
}

checkSchedules();
