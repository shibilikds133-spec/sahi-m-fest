const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // 1. Get active festival
  const { data: activeFestival, error: festivalError } = await supabase
    .from('festival_calendar')
    .select('*');
  console.log('All festivals:', activeFestival, 'Error:', festivalError);

  if (activeFestival && activeFestival.length > 0) {
    const fId = activeFestival[0].id;
    // 2. Query vw_public_schedule
    const { data: scheds, error: schedError } = await supabase
      .from('vw_public_schedule')
      .select('*')
      .eq('festival_id', fId);
    console.log(`vw_public_schedule count for active festival (${fId}):`, scheds ? scheds.length : 0, 'Error:', schedError);
    if (scheds && scheds.length > 0) {
      console.log('Sample schedules from view:', scheds.slice(0, 3));
    }

    // 3. Query schedules table directly
    const { data: rawScheds, error: rawSchedError } = await supabase
      .from('schedules')
      .select('*')
      .eq('festival_id', fId);
    console.log(`schedules table count for active festival (${fId}):`, rawScheds ? rawScheds.length : 0, 'Error:', rawSchedError);
    if (rawScheds && rawScheds.length > 0) {
      console.log('Sample raw schedules:', rawScheds.slice(0, 3));
    }
  }
}

run();
