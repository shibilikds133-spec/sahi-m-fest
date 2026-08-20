require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function testResult() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const regId = "58ed5183-2d30-478d-8fc9-ddf4881c6ef4";

  const { data, error } = await supabase.from('results').select('*').eq('registration_id', regId);
  
  if (error) console.error("Error:", error);

  console.log(JSON.stringify(data, null, 2));
}

testResult();
