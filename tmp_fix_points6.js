require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function debugPoints() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: results, error } = await supabase
    .from('results')
    .select('id, grade, rank, points_awarded, registration_id, registrations(item_id)');

  if (error) {
    console.error(error);
    return;
  }
  
  const { data: schedules, error: schError } = await supabase
    .from('schedules')
    .select('id, festival_id, item_id, official_participant_bracket, items(participation_type)');

  let updatedCount = 0;

  for (const res of results) {
    if (!res.grade && !res.rank) continue;

    const itemId = res.registrations?.item_id;
    if (!itemId) continue;

    const schedule = schedules.find(s => s.item_id === itemId);
    if (!schedule) continue;
    
    const isGroup = schedule.items?.participation_type === 'group';
    const bracketOverride = schedule.official_participant_bracket;

    if (isGroup && !bracketOverride) continue;

    const { data: calculatedPoints, error: rpcError } = await supabase.rpc('calculate_festival_points', {
      p_festival_id: schedule.festival_id,
      p_grade: res.grade && res.grade !== '-' ? res.grade : null,
      p_rank: res.rank || null,
      p_participant_count: 1,
      p_is_group: isGroup,
      p_bracket_override: bracketOverride || null
    });

    if (rpcError) continue;

    let finalTotal = 0;
    try {
      let obj = typeof calculatedPoints === 'string' ? JSON.parse(calculatedPoints) : calculatedPoints;
      // Handle if it's an array for some reason
      if (Array.isArray(obj)) obj = obj[0];
      
      finalTotal = obj?.total || 0;
    } catch(e) {
      console.error(e);
      continue;
    }
    
    const newPts = parseFloat(finalTotal).toFixed(2);
    const oldPts = res.points_awarded !== null ? parseFloat(res.points_awarded).toFixed(2) : '0.00';

    if (newPts !== oldPts) {
      const { error: updateError } = await supabase
        .from('results')
        .update({ points_awarded: finalTotal, points: finalTotal }) // also update old points col if it exists somehow
        .eq('id', res.id);
        
      if (updateError) {
        // try just points_awarded
        await supabase.from('results').update({ points_awarded: finalTotal }).eq('id', res.id);
      }
      updatedCount++;
    }
  }

  console.log(`Updated ${updatedCount} results.`);
}

debugPoints();
