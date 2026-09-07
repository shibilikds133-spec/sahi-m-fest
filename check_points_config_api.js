const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.staging' });

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL_STAGING,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY_STAGING
);

async function checkConfig() {
  const { data, error } = await supabase
    .from('points_config')
    .select('*');
    
  if (error) console.error(error);
  else console.log("Total configs:", data.length);
}

checkConfig();
