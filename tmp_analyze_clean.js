require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function analyzeResults() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: results, error } = await supabase
    .from('results')
    .select('id, grade, rank, points_awarded, is_published, item_id, items(item_name, participation_type)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }
  
  console.log(`--- ANALYSIS OF PUBLISHED RESULTS ---`);
  
  let groupResults = 0;
  let singleResults = 0;
  let missingPoints = 0;
  
  for (const r of results) {
    if (!r.grade && !r.rank) continue; // skip empty
    
    const itemName = r.items?.item_name || 'Unknown Item';
    const isGroup = r.items?.participation_type === 'group';
    
    if (r.points_awarded === 0 || r.points_awarded === null || Number.isNaN(r.points_awarded)) {
      missingPoints++;
      console.log(`[ZERO/NULL] Item: ${itemName} (${isGroup ? 'Group' : 'Single'}) | Rank: ${r.rank} | Grade: ${r.grade} | Points: ${r.points_awarded}`);
    } else {
      console.log(`[OK] Item: ${itemName} (${isGroup ? 'Group' : 'Single'}) | Rank: ${r.rank} | Grade: ${r.grade} | Points: ${r.points_awarded}`);
    }
    
    if (isGroup) groupResults++;
    else singleResults++;
  }
  
  console.log(`\nSummary:`);
  console.log(`Total Scored Results: ${groupResults + singleResults}`);
  console.log(`Group Results: ${groupResults}`);
  console.log(`Single Results: ${singleResults}`);
  console.log(`Results with Zero/Null Points: ${missingPoints}`);
}

analyzeResults();
