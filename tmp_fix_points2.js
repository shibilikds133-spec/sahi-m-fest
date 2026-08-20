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
    .select('id, grade, rank, points, registration_id, registrations(schedule_id, schedules(festival_id, official_participant_bracket, items(participation_type)))');

  if (error) {
    console.error(error);
    return;
  }

  console.log(`Found ${results.length} total results.`);
  
  let updatedCount = 0;

  for (const res of results) {
    if (!res.grade && !res.rank) continue;

    const schedule = res.registrations?.schedules;
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

    if (rpcError) {
      console.error(rpcError);
      continue;
    }

    const newPts = calculatedPoints ? parseFloat(calculatedPoints).toFixed(2) : '0.00';
    const oldPts = res.points ? parseFloat(res.points).toFixed(2) : '0.00';

    if (newPts !== oldPts) {
      console.log(`Mismatch found! Result ${res.id} - Rank ${res.rank}, Grade ${res.grade} | Old: ${oldPts}, New: ${newPts}`);
      
      const { error: updateError } = await supabase
        .from('results')
        .update({ points: calculatedPoints })
        .eq('id', res.id);
        
      if (updateError) {
        console.error('Update failed:', updateError);
      } else {
        updatedCount++;
      }
    }
  }

  console.log(`Updated ${updatedCount} results.`);
}

debugPoints();
