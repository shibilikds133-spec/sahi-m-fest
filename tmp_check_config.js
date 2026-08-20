require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function checkConfig() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: config } = await supabase
    .from('points_config')
    .select('*')
    .order('config_version', { ascending: false })
    .limit(1)
    .single();

  console.log(JSON.stringify(config, null, 2));
}

checkConfig();
