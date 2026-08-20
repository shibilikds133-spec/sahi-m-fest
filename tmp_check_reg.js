require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function checkReg() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: reg } = await supabase.from('registrations').select('*').limit(1).single();
  console.log(reg);
}

checkReg();
