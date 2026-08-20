require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data } = await supabase.from('items').select('*').limit(1);
  console.log(data);
}

test();
