const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://szhwkngspodujiqzblab.supabase.co';
const supabaseKey = 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: pts, error: pErr } = await supabase
    .from('participants')
    .select('*')
    .limit(5);
  console.log('Any participants found:', pts ? pts.length : 0, 'Error:', pErr);
  if (pts && pts.length > 0) {
    console.log('Sample participant:', pts[0]);
  }
}

run();
