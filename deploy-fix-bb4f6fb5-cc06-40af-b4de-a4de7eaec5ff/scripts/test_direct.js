const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://szhwkngspodujiqzblab.supabase.co';
const supabaseKey = 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: scheds, error: sErr } = await supabase
    .from('schedules')
    .select('*, items(*), venues(*)')
    .order('start_time');
  
  if (scheds) {
    const urduScheds = scheds.filter(s => {
      const name = s.items?.item_name_en || s.items?.item_name_ml || '';
      return name.toLowerCase().includes('urdu') || name.toLowerCase().includes('essay');
    });
    console.log('Urdu/Essay schedules found:', urduScheds.map(s => ({
      item: s.items?.item_name_en || s.items?.item_name_ml,
      start_time: s.start_time,
      status: s.status,
      venue: s.venues?.name
    })));
  } else {
    console.log('Error:', sErr);
  }
}

run();
