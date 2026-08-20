require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function checkResults() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: results, error } = await supabase
    .from('results')
    .select('id, rank, grade, published, result_status, public_visible')
    .limit(5);

  console.log(results);
}

checkResults();
