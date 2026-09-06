const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({path: '.env.local'});
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

// Fallback: fetch a row and look at the keys if execute_sql fails
async function main() {
  const { data, error } = await supabase.from('vw_public_schedule').select('*').limit(1);
  console.log("vw_public_schedule columns:", Object.keys(data[0] || {}));
}
main();
