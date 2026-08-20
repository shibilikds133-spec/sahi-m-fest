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

  const { data: festivals, error } = await supabase.from('festival_calendar').select('*');
  console.log('Festivals:', festivals);
  console.log('Error:', error);
}
run();
