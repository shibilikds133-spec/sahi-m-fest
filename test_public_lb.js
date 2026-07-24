const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('=== PUBLIC LEADERBOARD TEST ===\n');

  const { data: auth } = await supabase.auth.signInWithPassword({
    email: 'shibilikds938@gmail.com',
    password: 'm1o2n3u4'
  });
  console.log('✅ Logged in\n');

  const festivalId = 'e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6';

  console.log(`Running get_public_leaderboard for festival: ${festivalId}`);
  const { data: lb, error } = await supabase.rpc('get_public_leaderboard', {
    p_festival_id: festivalId
  });

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log(`✅ Returned ${lb?.length || 0} rows`);
    console.log(JSON.stringify(lb, null, 2));
  }
}

run();
