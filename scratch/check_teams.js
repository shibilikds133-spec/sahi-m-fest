const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: fests, error: err1 } = await supabase.from('festival_teams').select('*').eq('festival_id', '7ebe465a-8c64-4366-8faa-d04ff5d4b3d7');
  console.log('Festival Teams for Alviora,:', fests);
  console.log('Error:', err1);
}
run();
