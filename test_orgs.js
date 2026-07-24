const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Querying organizations table...');
  const { data, error } = await supabase
    .from('organisations')
    .select('id, name, org_type, parent_id, tenant_id');

  if (error) {
    console.error('Error fetching orgs:', error);
  } else {
    console.log(`Fetched ${data.length} organizations.`);
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
