const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient('https://szhwkngspodujiqzblab.supabase.co', 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc');

async function run() {
  await supabase.auth.signInWithPassword({ email: 'shibilikds938@gmail.com', password: 'm1o2n3u4' });

  // 1. Festival Calendar Query Evidence
  const { data: fests } = await supabase.from('festival_calendar').select('id, tenant_id, festival_year, level, custom_name, is_active, start_date, end_date');
  console.log('--- Festival Calendar Evidence ---');
  console.log(JSON.stringify(fests, null, 2));

  const festYearMap = new Map(fests.map(f => [f.id, f.festival_year]));

  // 2. Fetch all tables
  const { data: tenants } = await supabase.from('tenants').select('id, name, org_type');
  const { data: orgs } = await supabase.from('organisations').select('id, tenant_id, name, org_type, parent_id');
  const { data: parts } = await supabase.from('participants').select('id, tenant_id, festival_id, category_code, chest_number, created_at, import_source, organisation_id');
  const { data: items } = await supabase.from('items').select('id, tenant_id, festival_id, item_code, item_name_en, item_type');
  const { data: regs } = await supabase.from('registrations').select('id, tenant_id, festival_id, item_id, participant_id, organisation_id, status, is_locked, created_at');
  const { data: scheds } = await supabase.from('schedules').select('id, tenant_id, festival_id, item_id, venue_id, start_time, end_time, status, expected_judge_count');
  const { data: judges } = await supabase.from('judges').select('id, tenant_id, festival_id');
  const { data: jtokens } = await supabase.from('judge_tokens').select('id, tenant_id, judge_id, schedule_id, is_used, created_at, used_at');
  const { data: marks } = await supabase.from('mark_entries').select('id, tenant_id, schedule_id, judge_id, registration_id, total_mark, is_draft, is_final, submitted_at');
  const { data: results } = await supabase.from('results').select('id, tenant_id, festival_id, item_id, registration_id, total_score, rank, grade, points_awarded, published, result_status, public_visible, collection_method');

  const partMap = new Map(parts.map(p => [p.id, p]));
  const itemMap = new Map(items.map(i => [i.id, i]));
  const regMap = new Map(regs.map(r => [r.id, r]));
  const schedMap = new Map(scheds.map(s => [s.id, s]));
  const judgeMap = new Map(judges.map(j => [j.id, j]));
  const orgMap = new Map(orgs.map(o => [o.id, o]));

  // 3. 35 Schedule analysis (Actual Values)
  let nullSchedFestCount = 0;
  let nonNullIncorrectSchedFestCount = 0;
  let schedItemTenantMatches = 0;
  let schedItemTenantMismatches = 0;
  let schedsWithMarksCount = 0;
  let schedsWithoutMarksCount = 0;

  const schedBreakdown = [];

  scheds.forEach(s => {
    const item = itemMap.get(s.item_id);
    if (item && s.festival_id !== item.festival_id) {
      if (s.festival_id === null) nullSchedFestCount++;
      else nonNullIncorrectSchedFestCount++;

      if (s.tenant_id === item.tenant_id) schedItemTenantMatches++;
      else schedItemTenantMismatches++;

      const schedMarks = marks.filter(m => m.schedule_id === s.id);
      const schedTokens = jtokens.filter(jt => jt.schedule_id === s.id);

      if (schedMarks.length > 0) schedsWithMarksCount++;
      else schedsWithoutMarksCount++;

      schedBreakdown.push({
        id: s.id,
        actual_schedule_festival_id: s.festival_id,
        item_festival_id: item.festival_id,
        item_festival_year: festYearMap.get(item.festival_id) || 'UNKNOWN',
        schedule_tenant_id: s.tenant_id,
        item_tenant_id: item.tenant_id,
        mark_count: schedMarks.length,
        token_count: schedTokens.length,
        item_code: item.item_code,
        item_name: item.item_name_en
      });
    }
  });

  // 4. Analyze 13 Tokens attached to 19 schedules without marks
  const tokensOn19Scheds = [];
  scheds.forEach(s => {
    const item = itemMap.get(s.item_id);
    if (item && s.festival_id !== item.festival_id) {
      const schedMarks = marks.filter(m => m.schedule_id === s.id);
      if (schedMarks.length === 0) {
        const schedTokens = jtokens.filter(jt => jt.schedule_id === s.id);
        schedTokens.forEach(jt => {
          const j = judgeMap.get(jt.judge_id);
          tokensOn19Scheds.push({
            token_id: jt.id,
            schedule_id: s.id,
            judge_id: jt.judge_id,
            judge_festival_id: j?.festival_id,
            judge_festival_year: festYearMap.get(j?.festival_id),
            schedule_festival_id: s.festival_id,
            judge_sched_fest_mismatch: (j && j.festival_id !== s.festival_id),
            is_used: jt.is_used
          });
        });
      }
    }
  });

  // 5. Holistic evaluation of 59 registration tenant mismatches
  const regHolistic = [];
  regs.forEach(r => {
    const p = partMap.get(r.participant_id);
    if (p && r.tenant_id !== p.tenant_id) {
      const item = itemMap.get(r.item_id);
      const org = orgMap.get(r.organisation_id || p.organisation_id);
      const regResults = results.filter(res => res.registration_id === r.id);
      const regMarks = marks.filter(m => m.registration_id === r.id);

      regHolistic.push({
        registration_id: r.id,
        registration_tenant: r.tenant_id,
        participant_tenant: p.tenant_id,
        item_tenant: item?.tenant_id,
        organisation_tenant: org?.tenant_id,
        result_tenants: Array.from(new Set(regResults.map(res => res.tenant_id))),
        mark_tenants: Array.from(new Set(regMarks.map(m => m.tenant_id))),
        related_result_count: regResults.length,
        related_mark_count: regMarks.length,
        published_state: regResults.some(res => res.published),
        import_source: p.import_source || 'manual',
        organisation_type: org?.org_type,
        parent_org_id: org?.parent_id
      });
    }
  });

  // 6. TRUE DEDUPLICATION Metric Calculation by (table_name, row_id)
  const rootRowsSet = new Set();
  const dependentRowsSet = new Set();

  // Add Root Records
  // Issue 1: 59 Registrations
  regs.forEach(r => {
    const p = partMap.get(r.participant_id);
    if (p && r.tenant_id !== p.tenant_id) rootRowsSet.add('registrations:' + r.id);
  });
  // Issue 2: 1 Result
  results.forEach(res => {
    const reg = regMap.get(res.registration_id);
    const p = reg ? partMap.get(reg.participant_id) : null;
    if (p && res.festival_id !== p.festival_id) rootRowsSet.add('results:' + res.id);
  });
  // Issue 3: 35 Schedules
  scheds.forEach(s => {
    const item = itemMap.get(s.item_id);
    if (item && s.festival_id !== item.festival_id) rootRowsSet.add('schedules:' + s.id);
  });
  // Issue 4: 7 Registrations
  regs.forEach(r => {
    const p = partMap.get(r.participant_id);
    const item = itemMap.get(r.item_id);
    if (p && item && p.festival_id !== item.festival_id) rootRowsSet.add('registrations:' + r.id);
  });
  // Issue 8: 4 Dangling Tokens
  jtokens.forEach(jt => {
    if (jt.schedule_id && !schedMap.has(jt.schedule_id)) rootRowsSet.add('judge_tokens:' + jt.id);
  });
  // Issue 9: 7 Results
  results.filter(res => res.grade === null).forEach(res => rootRowsSet.add('results:' + res.id));

  // Add Dependent Records
  // Issue 5: 31 Judge Tokens on 16 active schedules
  jtokens.forEach(jt => {
    const j = judgeMap.get(jt.judge_id);
    const s = schedMap.get(jt.schedule_id);
    if (j && s && j.festival_id !== s.festival_id) dependentRowsSet.add('judge_tokens:' + jt.id);
  });
  // Issue 6/7: 120 Mark entries
  marks.forEach(m => {
    const j = judgeMap.get(m.judge_id);
    const s = schedMap.get(m.schedule_id);
    const reg = regMap.get(m.registration_id);
    const item = reg ? itemMap.get(reg.item_id) : null;
    if ((j && s && j.festival_id !== s.festival_id) || (item && s && item.festival_id !== s.festival_id)) {
      dependentRowsSet.add('mark_entries:' + m.id);
    }
  });

  // Calculate overlaps between Root and Dependent
  const overlapSet = new Set();
  rootRowsSet.forEach(key => {
    if (dependentRowsSet.has(key)) overlapSet.add(key);
  });

  const combinedSet = new Set([...rootRowsSet, ...dependentRowsSet]);

  const deduplicatedMetrics = {
    rawCategoryCounts: {
      issue1_reg_tenant: 59,
      issue2_result_fest: 1,
      issue3_sched_fest: 35,
      issue4_reg_part_item_fest: 7,
      issue5_judge_sched_fest_tokens: 31,
      issue6_7_mark_entries: 120,
      issue8_dangling_tokens: 4,
      issue9_null_grade_results: 7
    },
    uniqueRootRecordCount: rootRowsSet.size,
    uniqueDependentRecordCount: dependentRowsSet.size,
    overlapCount: overlapSet.size,
    combinedUniqueAffectedRowCount: combinedSet.size
  };

  console.log('\n--- DEDUPLICATED METRICS BY (table_name, row_id) ---');
  console.log(JSON.stringify(deduplicatedMetrics, null, 2));

  fs.writeFileSync('final_read_only_evidence.json', JSON.stringify({
    festivals: fests,
    deduplicatedMetrics,
    schedCounts: {
      nullSchedFestCount,
      nonNullIncorrectSchedFestCount,
      schedItemTenantMatches,
      schedItemTenantMismatches,
      schedsWithMarksCount,
      schedsWithoutMarksCount
    },
    schedBreakdown,
    tokensOn19Scheds,
    regHolistic
  }, null, 2));

  console.log('Saved final_read_only_evidence.json');
}

run();
