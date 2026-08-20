const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });

  const { data: orgs } = await supabase.from('organisations').select('id, name, parent_id').in('id', ['a92e68d7-2a75-455f-b77f-1cfb303a7541', 'f8dd1139-12ef-4b75-9ba4-5e1e36bae9eb', '09706507-6ee0-405f-a794-aca8bd8e159a']);
  console.log('Organisations:', orgs);
}
run();
