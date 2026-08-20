require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function fixAllPoints() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: results, error } = await supabase
    .from('results')
    .select('id, grade, rank, points_awarded, festival_id, item_id');

  if (error) {
    console.error(error);
    return;
  }
  
  const { data: schedules } = await supabase.from('schedules').select('item_id, official_participant_bracket');
  const { data: items } = await supabase.from('items').select('id, participation_type, item_name_en');

  let updatedCount = 0;

  for (const r of results) {
    if (!r.grade && !r.rank) continue;

    const item = items.find(i => i.id === r.item_id);
    const schedule = schedules.find(s => s.item_id === r.item_id);
    
    if (!item) continue;
    
    const isGroup = item.participation_type === 'group';
    const bracketOverride = schedule?.official_participant_bracket;

    if (isGroup && !bracketOverride) continue;

    const { data: rpcOut, error: rpcError } = await supabase.rpc('calculate_festival_points', {
      p_festival_id: r.festival_id,
      p_grade: r.grade && r.grade !== '-' ? r.grade : null,
      p_rank: r.rank || null,
      p_participant_count: 1,
      p_is_group: isGroup,
      p_bracket_override: bracketOverride || null
    });

    if (rpcError) continue;

    let finalTotal = 0;
    let obj = null;
    try {
      obj = typeof rpcOut === 'string' ? JSON.parse(rpcOut) : rpcOut;
      if (Array.isArray(obj)) obj = obj[0];
      finalTotal = obj?.total || 0;
    } catch(e) { continue; }
    
    const newPts = parseFloat(finalTotal).toFixed(2);
    const oldPts = r.points_awarded !== null ? parseFloat(r.points_awarded).toFixed(2) : '0.00';

    if (newPts !== oldPts) {
      console.log(`Mismatch on ${item.item_name_en}: Old: ${oldPts} -> New: ${newPts}`);
      const { error: updateError } = await supabase
        .from('results')
        .update({ points_awarded: finalTotal, points_calculation: obj })
        .eq('id', r.id);
        
      if (updateError) {
        console.error('Failed to update', updateError);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`Updated ${updatedCount} results.`);
}

fixAllPoints();
