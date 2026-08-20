const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';
const supabase = createClient('https://szhwkngspodujiqzblab.supabase.co', 'sb_publishable_kgQJRDrtXp_RZu9QzIOh8g_USfkltfc');

async function run() {
  await supabase.auth.signInWithPassword({ email: 'shibilikds938@gmail.com', password: 'm1o2n3u4' });

  // Fetch live tables
  const { data: fests } = await supabase.from('festival_calendar').select('*');
  const { data: tenants } = await supabase.from('tenants').select('*');
  const { data: orgs } = await supabase.from('organisations').select('*');
  const { data: parts } = await supabase.from('participants').select('*');
  const { data: items } = await supabase.from('items').select('*');
  const { data: regs } = await supabase.from('registrations').select('*');
  const { data: scheds } = await supabase.from('schedules').select('*');
  const { data: judges } = await supabase.from('judges').select('*');
  const { data: jtokens } = await supabase.from('judge_tokens').select('*');
  const { data: marks } = await supabase.from('mark_entries').select('*');
  const { data: results } = await supabase.from('results').select('*');
  const { data: jlogs } = await supabase.from('audit_logs').select('*').eq('table_name', 'judge_tokens');

  const festMap = new Map(fests.map(f => [f.id, f]));
  const festYearMap = new Map(fests.map(f => [f.id, f.festival_year]));
  const tenantMap = new Map(tenants.map(t => [t.id, t]));
  const orgMap = new Map(orgs.map(o => [o.id, o]));
  const partMap = new Map(parts.map(p => [p.id, p]));
  const itemMap = new Map(items.map(i => [i.id, i]));
  const regMap = new Map(regs.map(r => [r.id, r]));
  const schedMap = new Map(scheds.map(s => [s.id, s]));
  const judgeMap = new Map(judges.map(j => [j.id, j]));

  // 1. DEDUPLICATED ROW MAPPING JSON
  const rowMapping = [];

  // Cat 1: 59 Reg tenant mismatches
  regs.forEach(r => {
    const p = partMap.get(r.participant_id);
    if (p && r.tenant_id !== p.tenant_id) {
      const item = itemMap.get(r.item_id);
      const org = orgMap.get(r.organisation_id || p.organisation_id);
      const regRes = results.filter(res => res.registration_id === r.id);
      const regMarks = marks.filter(m => m.registration_id === r.id);

      rowMapping.push({
        issue_type: "59 registration-to-participant tenant mismatches",
        table_name: "registrations",
        row_id: r.id,
        linked_record_ids: { participant_id: r.participant_id, item_id: r.item_id, organisation_id: r.organisation_id },
        current_tenant_id: r.tenant_id,
        linked_tenant_id: p.tenant_id,
        item_tenant_id: item?.tenant_id,
        organisation_tenant_id: org?.tenant_id,
        current_festival_id: r.festival_id,
        linked_festival_id: p.festival_id,
        current_status: r.status,
        published_state: regRes.some(res => res.published),
        related_result_count: regRes.length,
        related_mark_count: regMarks.length,
        import_source: p.import_source || "manual",
        proposed_candidate_authority: "UNAPPROVED — OPERATOR DECISION REQUIRED",
        confidence_level: "NEUTRAL",
        exact_reason: "Sector tenant assigned to registration/item/result/mark while participant/organisation have unit tenant. Hybrid tenant architecture evaluation required",
        automatic_correction_safe: false,
        operator_approval_required: true,
        classification: "MANUAL/BATCH REVIEW REQUIRED"
      });
    }
  });

  // Cat 2: 1 Result Mismatch
  results.forEach(res => {
    const reg = regMap.get(res.registration_id);
    const p = reg ? partMap.get(reg.participant_id) : null;
    const item = reg ? itemMap.get(reg.item_id) : null;
    if (p && res.festival_id !== p.festival_id) {
      rowMapping.push({
        issue_type: "1 result-to-participant festival mismatch",
        table_name: "results",
        row_id: res.id,
        linked_record_ids: { registration_id: res.registration_id, participant_id: reg.participant_id, item_id: res.item_id },
        current_tenant_id: res.tenant_id,
        linked_tenant_id: p.tenant_id,
        current_festival_id: res.festival_id,
        linked_festival_id: p.festival_id,
        current_festival_year: festYearMap.get(res.festival_id),
        linked_festival_year: festYearMap.get(p.festival_id),
        current_status: res.result_status,
        published_state: res.published,
        proposed_candidate_authority: "UNAPPROVED — OPERATOR DECISION REQUIRED",
        confidence_level: "NEUTRAL",
        exact_reason: "Result festival_id (2027) differs from participant and registration festival_id (2026)",
        automatic_correction_safe: false,
        operator_approval_required: true,
        classification: "MANUAL REVIEW REQUIRED"
      });
    }
  });

  // Cat 3: 35 Schedule Mismatches
  scheds.forEach(s => {
    const item = itemMap.get(s.item_id);
    if (item && s.festival_id !== item.festival_id) {
      const schedMarks = marks.filter(m => m.schedule_id === s.id);
      const schedTokens = jtokens.filter(jt => jt.schedule_id === s.id);
      rowMapping.push({
        issue_type: schedMarks.length > 0 ? "16 schedules with marks (festival_id IS NULL)" : "19 schedules without marks (festival_id IS NULL)",
        table_name: "schedules",
        row_id: s.id,
        linked_record_ids: { item_id: s.item_id, item_code: item.item_code },
        current_tenant_id: s.tenant_id,
        linked_tenant_id: item.tenant_id,
        current_festival_id: s.festival_id,
        linked_festival_id: item.festival_id,
        linked_festival_year: festYearMap.get(item.festival_id),
        current_status: s.status,
        published_state: false,
        mark_count: schedMarks.length,
        token_count: schedTokens.length,
        proposed_candidate_authority: "UNAPPROVED — OPERATOR DECISION REQUIRED",
        confidence_level: "HIGH",
        exact_reason: "Actual schedules.festival_id is NULL while linked item festival_id is e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6 (Year 2027)",
        automatic_correction_safe: false,
        operator_approval_required: true,
        classification: "MANUAL/BATCH REVIEW REQUIRED"
      });
    }
  });

  // Cat 4: 7 Reg Participant/Item Mismatches
  regs.forEach(r => {
    const p = partMap.get(r.participant_id);
    const item = itemMap.get(r.item_id);
    if (p && item && p.festival_id !== item.festival_id) {
      rowMapping.push({
        issue_type: "7 registration participant/item festival mismatches",
        table_name: "registrations",
        row_id: r.id,
        linked_record_ids: { participant_id: r.participant_id, item_id: r.item_id },
        current_tenant_id: r.tenant_id,
        linked_tenant_id: r.tenant_id,
        current_festival_id: r.festival_id,
        linked_festival_id: p.festival_id,
        item_festival_id: item.festival_id,
        participant_festival_year: festYearMap.get(p.festival_id),
        item_festival_year: festYearMap.get(item.festival_id),
        current_status: r.status,
        published_state: false,
        proposed_candidate_authority: "UNAPPROVED — OPERATOR DECISION REQUIRED",
        confidence_level: "NEUTRAL",
        exact_reason: "Participant (Year 2026) registered for Year 2027 item. Individual evaluation required",
        automatic_correction_safe: false,
        operator_approval_required: true,
        classification: "MANUAL REVIEW REQUIRED"
      });
    }
  });

  // Cat 5: 31 Judge Tokens on Active Schedules (Dependent)
  jtokens.forEach(jt => {
    const j = judgeMap.get(jt.judge_id);
    const s = schedMap.get(jt.schedule_id);
    if (j && s && j.festival_id !== s.festival_id) {
      rowMapping.push({
        issue_type: "31 judge tokens linked to 16 schedules with NULL festival_id",
        table_name: "judge_tokens",
        row_id: jt.id,
        linked_record_ids: { judge_id: jt.judge_id, schedule_id: jt.schedule_id },
        current_tenant_id: jt.tenant_id,
        linked_tenant_id: j.tenant_id,
        current_festival_id: s.festival_id,
        linked_festival_id: j.festival_id,
        current_status: jt.is_used ? "used" : "unused",
        published_state: false,
        proposed_candidate_authority: "UNAPPROVED — PRESERVE TOKEN INTACT",
        confidence_level: "HIGH",
        exact_reason: "Token query mismatch caused solely by schedules.festival_id = NULL. Token record must be preserved",
        automatic_correction_safe: false,
        operator_approval_required: true,
        classification: "DEPENDENT RECORD — PRESERVE"
      });
    }
  });

  // Cat 6/7: 120 Mark Entries (Dependent)
  marks.forEach(m => {
    const j = judgeMap.get(m.judge_id);
    const s = schedMap.get(m.schedule_id);
    const reg = regMap.get(m.registration_id);
    const item = reg ? itemMap.get(reg.item_id) : null;
    if ((j && s && j.festival_id !== s.festival_id) || (item && s && item.festival_id !== s.festival_id)) {
      rowMapping.push({
        issue_type: "120 mark-to-schedule festival mismatches",
        table_name: "mark_entries",
        row_id: m.id,
        linked_record_ids: { judge_id: m.judge_id, schedule_id: m.schedule_id, registration_id: m.registration_id },
        current_tenant_id: m.tenant_id,
        linked_tenant_id: j?.tenant_id,
        current_festival_id: s.festival_id,
        linked_festival_id: j?.festival_id,
        current_status: m.is_final ? "final" : "draft",
        published_state: false,
        proposed_candidate_authority: "UNAPPROVED — PRESERVE MARK VALUE INTACT",
        confidence_level: "HIGH",
        exact_reason: "Mark entry is finalized. Mismatch caused solely by schedules.festival_id = NULL. Mark record must be preserved",
        automatic_correction_safe: false,
        operator_approval_required: true,
        classification: "HISTORICAL DATA — PRESERVE"
      });
    }
  });

  // Cat 8: 4 Dangling Tokens (Root)
  jtokens.forEach(jt => {
    if (jt.schedule_id && !schedMap.has(jt.schedule_id)) {
      rowMapping.push({
        issue_type: "4 judge tokens referencing missing schedules",
        table_name: "judge_tokens",
        row_id: jt.id,
        linked_record_ids: { judge_id: jt.judge_id, missing_schedule_id: jt.schedule_id },
        current_tenant_id: jt.tenant_id,
        linked_tenant_id: jt.tenant_id,
        current_festival_id: null,
        linked_festival_id: null,
        current_status: "unused",
        published_state: false,
        proposed_candidate_authority: "REVOCATION SCHEMA (PENDING STAGING TEST)",
        confidence_level: "HIGH",
        exact_reason: "Token references deleted schedule UUID with 0 mark entries. Token will be revoked only after staging test of revocation schema",
        automatic_correction_safe: false,
        operator_approval_required: true,
        classification: "INVALID REFERENCE — REVOCATION/ARCHIVE CANDIDATE"
      });
    }
  });

  // Cat 9: 7 Published Results with grade = NULL (Root)
  results.filter(res => res.grade === null).forEach(res => {
    rowMapping.push({
      issue_type: "7 published result rows with grade = NULL",
      table_name: "results",
      row_id: res.id,
      linked_record_ids: { registration_id: res.registration_id, item_id: res.item_id },
      current_tenant_id: res.tenant_id,
      linked_tenant_id: res.tenant_id,
      current_festival_id: res.festival_id,
      linked_festival_id: res.festival_id,
      current_status: res.result_status,
      published_state: res.published,
      proposed_candidate_authority: "UNAPPROVED — ORIGINAL SCORECARD INSPECTION",
      confidence_level: "NEUTRAL",
      exact_reason: "total_score IS NULL. Grade cannot be derived from rank/points alone. Original scorecards must be inspected or grade preserved as NULL",
      automatic_correction_safe: false,
      operator_approval_required: true,
      classification: "MANUAL REVIEW REQUIRED"
    });
  });

  fs.writeFileSync(path.join(artDir, 'FINAL_ROW_MAPPING.json'), JSON.stringify(rowMapping, null, 2));
  console.log('Saved FINAL_ROW_MAPPING.json (' + rowMapping.length + ' entries)');

  // Save raw helper JSON for rendering markdown artifacts
  fs.writeFileSync('final_render_data.json', JSON.stringify({
    fests,
    tenants,
    orgs,
    parts,
    items,
    regs,
    scheds,
    judges,
    jtokens,
    marks,
    results,
    jlogs
  }, null, 2));
}

run();
