require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function testRpc() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const slug = "abdul-vajid-3530b224";

  const { data, error } = await supabase.rpc('get_public_candidate_profile', {
    p_slug: slug,
  });
  
  if (error) console.error("RPC Error:", error);

  console.log(JSON.stringify(data, null, 2));
}

testRpc();
