require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function checkSchema() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data, error } = await supabase
    .from('results')
    .select('*')
    .limit(1);

  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}

checkSchema();
