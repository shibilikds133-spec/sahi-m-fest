const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: festivals } = await supabase.from('festival_calendar').select('id, custom_name, is_active').order('start_date', { ascending: false });
  console.log("Festivals:", festivals);
}
check();
