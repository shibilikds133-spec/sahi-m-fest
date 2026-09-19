const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const fId = '7ebe465a-8c64-4366-8faa-d04ff5d4b3d7';
  const { data: results } = await supabase.from('results').select('id, published, result_status, public_visible').eq('festival_id', fId);
  console.log("Total results:", results?.length);
  console.log("Published results:", results?.filter(r => r.published && r.result_status === 'published' && r.public_visible).length);

  // Let's call the RPC directly with the exact params!
  const { data: rpcRes, error } = await supabase.rpc('get_public_published_results', {
    p_tenant_id: 'f87172d1-ed27-4db4-842c-cc00d3d56de2',
    p_festival_id: fId,
    p_include_participant_details: true
  });
  console.log("RPC returned:", rpcRes?.length, error);
}
check();
