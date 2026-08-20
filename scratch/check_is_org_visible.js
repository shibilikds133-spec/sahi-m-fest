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

  const { data: func } = await supabase.rpc('get_function_temp', { func_name: 'is_org_visible' }).catch(() => ({data: null}));
  if (func) console.log(func);
  else {
    const { data: res } = await supabase.from('pg_proc').select('proname, prosrc').eq('proname', 'is_org_visible');
    console.log(res);
  }
}
run();
