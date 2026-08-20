require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

async function fixPoints() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  console.log('Fetching results with schedule and item info...');

  // We need results, registrations, items, and schedules
  // Supabase REST might be tricky with multiple deep joins. Let's fetch schedules, items, then results.
  const { data: schedules, error: schError } = await supabase
    .from('schedules')
    .select('id, item_id, festival_id, official_participant_bracket, items(participation_type)');

  if (schError) {
    console.error('Error fetching schedules', schError);
    return;
  }

  let updatedCount = 0;
  let skippedGroupCount = 0;

  for (const schedule of schedules) {
    const isGroup = schedule.items?.participation_type === 'group';
    const bracketOverride = schedule.official_participant_bracket;

    if (isGroup && !bracketOverride) {
      // We don't know the exact team size bracket, so we must skip.
      skippedGroupCount++;
      continue;
    }

    // Fetch all registrations for this schedule
    const { data: regs, error: regError } = await supabase
      .from('registrations')
      .select('id')
      .eq('schedule_id', schedule.id);

    if (regError || !regs || regs.length === 0) continue;

    const regIds = regs.map(r => r.id);

    // Fetch results for these registrations
    const { data: results, error: resError } = await supabase
      .from('results')
      .select('id, grade, rank, points, registration_id')
      .in('registration_id', regIds);

    if (resError || !results) continue;

    for (const result of results) {
      if (!result.grade && !result.rank) continue;

      // Call the RPC to get the correct points
      const { data: calculatedPoints, error: rpcError } = await supabase.rpc('calculate_festival_points', {
        p_festival_id: schedule.festival_id,
        p_grade: result.grade && result.grade !== '-' ? result.grade : null,
        p_rank: result.rank || null,
        p_participant_count: 1, // for group it will be overridden by p_bracket_override if provided
        p_is_group: isGroup,
        p_bracket_override: bracketOverride || null
      });

      if (rpcError) {
        console.error('Error calculating points for result', result.id, rpcError);
        continue;
      }

      // Supabase numeric might come back as string or number
      const newPointsStr = calculatedPoints ? parseFloat(calculatedPoints).toFixed(2) : '0.00';
      const oldPointsStr = result.points ? parseFloat(result.points).toFixed(2) : '0.00';

      if (newPointsStr !== oldPointsStr) {
        console.log(`Updating Result ${result.id}: ${oldPointsStr} -> ${newPointsStr}`);
        const { error: updateError } = await supabase
          .from('results')
          .update({ points: calculatedPoints })
          .eq('id', result.id);
          
        if (updateError) {
          console.error('Error updating result', result.id, updateError);
        } else {
          updatedCount++;
        }
      }
    }
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Successfully updated ${updatedCount} results to the new point system.`);
  console.log(`Skipped ${skippedGroupCount} group schedules because they lack an Official Participant Bracket.`);
}

fixPoints();
