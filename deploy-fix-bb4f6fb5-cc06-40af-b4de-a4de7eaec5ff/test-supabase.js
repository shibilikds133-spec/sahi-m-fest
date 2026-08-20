const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://szhwkngspodujiqzblab.supabase.co',
  'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc'
);

async function test() {
  const { data, error } = await supabase
    .from('participants')
    .select('id, name')
    .limit(1);
    
  console.log('Direct query:', { data, error });

  if (data && data.length > 0) {
    const id = data[0].id;
    console.log('Testing RPC with UUID:', id);
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_public_candidate_profile', { p_slug: id });
    console.log('RPC with UUID result:', { rpcData, rpcError });
  }
}

test();
