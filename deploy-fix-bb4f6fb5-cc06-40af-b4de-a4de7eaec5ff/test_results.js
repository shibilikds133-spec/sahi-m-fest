const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Querying results table directly...');
  const { data: results, error: resultsErr } = await supabase
    .from('results')
    .select('*')
    .limit(5);

  if (resultsErr) {
    console.error('Error fetching results:', resultsErr);
  } else {
    console.log(`Successfully fetched ${results.length} rows directly from results table.`);
    console.log('Sample rows:', JSON.stringify(results, null, 2));
  }

  console.log('\nQuerying festival_calendar directly...');
  const { data: fc, error: fcErr } = await supabase
    .from('festival_calendar')
    .select('*')
    .eq('is_active', true);

  if (fcErr) {
    console.error('Error fetching festival_calendar:', fcErr);
  } else {
    console.log('Active festival calendar:', JSON.stringify(fc, null, 2));
  }

  const activeFestivalId = fc && fc[0] ? fc[0].id : null;
  const tenantId = fc && fc[0] ? fc[0].tenant_id : null;

  console.log(`\nCalling get_festival_results RPC with p_tenant_id=${tenantId}, p_festival_id=${activeFestivalId}...`);
  const { data: rpcData, error: rpcErr } = await supabase.rpc('get_festival_results', {
    p_tenant_id: tenantId,
    p_festival_id: activeFestivalId
  });

  if (rpcErr) {
    console.error('Error calling get_festival_results:', rpcErr);
  } else {
    console.log(`Successfully called get_festival_results. Returned ${rpcData.length} rows.`);
    console.log('Sample RPC rows:', JSON.stringify(rpcData.slice(0, 5), null, 2));
  }
}

run();
