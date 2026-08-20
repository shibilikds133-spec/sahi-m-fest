const fs = require('fs');
const path = require('path');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';

const evData = JSON.parse(fs.readFileSync('final_read_only_evidence.json', 'utf8'));
const rawData = JSON.parse(fs.readFileSync('forensic_raw_data.json', 'utf8'));

// ==============================================================================
// 1. FORENSIC_ROW_MAPPING.json
// ==============================================================================
const rowMapping = [];

// 59 Reg Mismatches
evData.regHolistic.forEach(r => {
  rowMapping.push({
    issue_type: "59 registration-to-participant tenant mismatches",
    table_name: "registrations",
    row_id: r.registration_id,
    linked_record_ids: { participant_tenant: r.participant_tenant, item_tenant: r.item_tenant, organisation_tenant: r.organisation_tenant },
    current_tenant_id: r.registration_tenant,
    linked_tenant_id: r.participant_tenant,
    current_festival_id: null,
    linked_festival_id: null,
    current_status: "active",
    published_state: r.published_state,
    proposed_candidate_authority: "UNAPPROVED — PENDING MULTI-TABLE EVALUATION",
    confidence_level: "NEUTRAL",
    exact_reason: "Sector tenant assigned to registration/item/result/mark while participant/organisation have unit tenant. All multi-table relationships must be evaluated together",
    automatic_correction_safe: false,
    operator_approval_required: true,
    classification: "MANUAL/BATCH REVIEW REQUIRED"
  });
});

// 1 Result Mismatch
rowMapping.push({
  issue_type: "1 result-to-participant festival mismatch",
  table_name: "results",
  row_id: "76bd3bab-bf8e-413f-8565-b92f65fe54c4",
  linked_record_ids: { registration_id: "bdd69c49-9d93-4ce0-90e5-c43052242991", participant_id: "34654458-9cbd-4b9d-b844-213423bcdd64", item_id: "JR-009" },
  current_tenant_id: "d3ed1102-31a6-4e44-86ca-7a41c4359db1",
  linked_tenant_id: "090117b7-d709-4224-a75a-90028b3ba7cf",
  current_festival_id: "e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6",
  linked_festival_id: "550e8400-e29b-41d4-a716-446655440000",
  current_status: "published",
  published_state: true,
  proposed_candidate_authority: "UNAPPROVED — PENDING OPERATOR DECISION",
  confidence_level: "NEUTRAL",
  exact_reason: "Result festival_id (year 2027) differs from participant and registration festival_id (year 2026)",
  automatic_correction_safe: false,
  operator_approval_required: true,
  classification: "MANUAL REVIEW REQUIRED"
});

// 35 Schedule Mismatches
evData.schedBreakdown.forEach(s => {
  rowMapping.push({
    issue_type: s.mark_count > 0 ? "16 schedules with marks (festival_id IS NULL)" : "19 schedules without marks (festival_id IS NULL)",
    table_name: "schedules",
    row_id: s.id,
    linked_record_ids: { item_id: s.item_code },
    current_tenant_id: s.schedule_tenant_id,
    linked_tenant_id: s.item_tenant_id,
    current_festival_id: s.actual_schedule_festival_id,
    linked_festival_id: s.item_festival_id,
    current_status: "active",
    published_state: false,
    proposed_candidate_authority: "UNAPPROVED — PENDING OPERATOR VERIFICATION",
    confidence_level: "HIGH",
    exact_reason: "Actual schedules.festival_id is NULL while linked item festival_id is e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6 (year 2027). Schedule has " + s.mark_count + " marks and " + s.token_count + " tokens",
    automatic_correction_safe: false,
    operator_approval_required: true,
    classification: "MANUAL/BATCH REVIEW REQUIRED"
  });
});

// 7 Reg Participant/Item Mismatches
rawData.issue4.forEach(r => {
  rowMapping.push({
    issue_type: "7 registration participant/item festival mismatches (subset of 59 reg rows)",
    table_name: "registrations",
    row_id: r.row_id,
    linked_record_ids: r.linked_record_ids,
    current_tenant_id: r.current_tenant_id,
    linked_tenant_id: r.current_tenant_id,
    current_festival_id: r.registration_festival_id,
    linked_festival_id: r.participant_festival_id,
    current_status: "approved",
    published_state: false,
    proposed_candidate_authority: "UNAPPROVED — PENDING OPERATOR DECISION",
    confidence_level: "NEUTRAL",
    exact_reason: "Participant (year 2026) registered for year 2027 item. Review must determine whether participant festival, item selection, or registration entry is incorrect",
    automatic_correction_safe: false,
    operator_approval_required: true,
    classification: "MANUAL REVIEW REQUIRED"
  });
});

// 120 Mark Mismatches
rawData.issue6_7.forEach(m => {
  rowMapping.push({
    issue_type: "120 mark-to-schedule festival mismatches (dependent records)",
    table_name: "mark_entries",
    row_id: m.row_id,
    linked_record_ids: m.linked_record_ids,
    current_tenant_id: m.mark_tenant_id,
    linked_tenant_id: m.judge_tenant_id,
    current_festival_id: m.schedule_festival_id,
    linked_festival_id: m.judge_festival_id,
    current_status: m.is_final ? "final" : "draft",
    published_state: false,
    proposed_candidate_authority: "UNAPPROVED — PRESERVE MARK VALUE INTACT",
    confidence_level: "HIGH",
    exact_reason: "Mark entry is finalized. Mismatch caused solely by schedules.festival_id = NULL. Mark record must be preserved",
    automatic_correction_safe: false,
    operator_approval_required: true,
    classification: "HISTORICAL DATA — PRESERVE"
  });
});

// 4 Dangling Tokens
rawData.issue8.forEach(jt => {
  rowMapping.push({
    issue_type: "4 judge tokens referencing missing schedules",
    table_name: "judge_tokens",
    row_id: jt.row_id,
    linked_record_ids: { judge_id: jt.judge_id, missing_schedule_id: jt.missing_schedule_id },
    current_tenant_id: jt.tenant_id,
    linked_tenant_id: jt.tenant_id,
    current_festival_id: null,
    linked_festival_id: null,
    current_status: "unused",
    published_state: false,
    proposed_candidate_authority: "REVOCATION SCHEMA (PENDING STAGING TEST)",
    confidence_level: "HIGH",
    exact_reason: "Token references deleted schedule UUID with 0 mark entries. Token will be revoked only after staging test",
    automatic_correction_safe: false,
    operator_approval_required: true,
    classification: "INVALID REFERENCE — REVOKE/ARCHIVE"
  });
});

// 7 NULL-grade results
rawData.issue9.forEach(r => {
  rowMapping.push({
    issue_type: "7 published result rows with grade = NULL",
    table_name: "results",
    row_id: r.id,
    linked_record_ids: { registration_id: r.registration_id, item_id: r.item_id },
    current_tenant_id: r.tenant_id,
    linked_tenant_id: r.tenant_id,
    current_festival_id: r.festival_id,
    linked_festival_id: r.festival_id,
    current_status: r.result_status,
    published_state: r.published,
    proposed_candidate_authority: "ORIGINAL SCORECARD INSPECTION",
    confidence_level: "NEUTRAL",
    exact_reason: "total_score IS NULL. Grade cannot be derived from rank/points alone. Original scorecards must be inspected or grade preserved as NULL",
    automatic_correction_safe: false,
    operator_approval_required: true,
    classification: "MANUAL REVIEW REQUIRED"
  });
});

fs.writeFileSync(path.join(artDir, 'FORENSIC_ROW_MAPPING.json'), JSON.stringify(rowMapping, null, 2));
console.log('Saved FORENSIC_ROW_MAPPING.json');


// ==============================================================================
// 2. FORENSIC_MISMATCH_SUMMARY.md
// ==============================================================================
let summaryLines = [];
summaryLines.push('# Corrected Read-Only Forensic Mismatch Summary Report');
summaryLines.push('');
summaryLines.push('**Execution Mode**: Strict Read-Only Catalog & Data Query');
summaryLines.push('**Date**: 2026-07-24');
summaryLines.push('');
summaryLines.push('> [!IMPORTANT]');
summaryLines.push('> No database mutation, DDL, DML, policy change, migration repair, or auto-fix execution was performed. All candidate authorities remain 100% UNAPPROVED. All 151 finalized mark records remain intact.');
summaryLines.push('');
summaryLines.push('---');
summaryLines.push('');
summaryLines.push('## 1. Deduplicated Metric Breakdown by `(table_name, row_id)`');
summaryLines.push('');
summaryLines.push('| Metric Category | Count | Calculation & Deduplication Description |');
summaryLines.push('|---|---|---|');
summaryLines.push('| **Raw Category Sum** | **264** | Sum of un-deduplicated category counts (59 + 1 + 35 + 7 + 31 + 120 + 4 + 7) |');
summaryLines.push('| **Unique Root Record Count** | **106** | Unique root entity row IDs (35 schedules + 59 registrations + 4 dangling tokens + 1 result + 7 NULL-grade results; 7 reg mismatches are a subset of 59 regs) |');
summaryLines.push('| **Unique Dependent Record Count** | **151** | Unique dependent row IDs (120 mark entries + 31 judge tokens on 16 active schedules) |');
summaryLines.push('| **Overlap Count (Root vs Dependent)** | **0** | Number of row IDs present in both root and dependent sets |');
summaryLines.push('| **Combined Unique Affected Row Count** | **257** | Total unique database rows affected across the entire schema (106 root + 151 dependent) |');
summaryLines.push('');
summaryLines.push('---');
summaryLines.push('');
summaryLines.push('## 2. Catalog Evidence: `festival_calendar` Year Verification');
summaryLines.push('');
summaryLines.push('* **Query Executed**: `SELECT id, tenant_id, festival_year, custom_name, is_active FROM festival_calendar;`');
summaryLines.push('* **Returned Results**:');
summaryLines.push('  - `550e8400-e29b-41d4-a716-446655440000` -> **Year 2026** (level `unit`, `is_active = true`)');
summaryLines.push('  - `6bd3086f-ab2c-4f47-8dc3-cff6fc29cd55` -> **Year 2025** (WANDOOR DIVITION SAHITHYOLSAV)');
summaryLines.push('  - `33c2f234-aacf-457f-926e-3941952d3384` -> **Year 2025** (KODASSERY SECTORE)');
summaryLines.push('  - `e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6` -> **Year 2027** (KODASSERI SECTORE SAHITHYOLSAV)');
summaryLines.push('');
summaryLines.push('---');
summaryLines.push('');
summaryLines.push('## 3. Detailed Breakdown of 35 Mismatched Schedules');
summaryLines.push('');
summaryLines.push('### Schedule Attribute Aggregate Counts:');
summaryLines.push('* **NULL Schedule Festival IDs**: **35**');
summaryLines.push('* **Non-NULL Incorrect Festival IDs**: **0**');
summaryLines.push('* **Schedule / Item Tenant Matches**: **35** (`d3ed1102-31a6-4e44-86ca-7a41c4359db1`)');
summaryLines.push('* **Schedule / Item Tenant Mismatches**: **0**');
summaryLines.push('* **Schedules with Finalized Marks**: **16** (120 marks, 31 judge tokens)');
summaryLines.push('* **Schedules without Marks**: **19** (0 marks, 13 judge tokens)');
summaryLines.push('');
summaryLines.push('### A. 16 Schedules Associated with 120 Mark Rows');
summaryLines.push('');
summaryLines.push('| Schedule UUID | Item Code / Name | Actual Sched Fest ID | Item Fest ID (Year) | Sched Tenant | Item Tenant | Marks | Tokens |');
summaryLines.push('|---|---|---|---|---|---|---|---|');

evData.schedBreakdown.filter(s => s.mark_count > 0).forEach(s => {
  summaryLines.push('| `' + s.id + '` | ' + s.item_code + ' (' + s.item_name + ') | `NULL` | `' + s.item_festival_id + '` (2027) | `' + s.schedule_tenant_id + '` | `' + s.item_tenant_id + '` | **' + s.mark_count + '** | **' + s.token_count + '** |');
});

summaryLines.push('');
summaryLines.push('### B. Remaining 19 Mismatched Schedules (0 Mark Rows)');
summaryLines.push('');
summaryLines.push('| Schedule UUID | Item Code / Name | Actual Sched Fest ID | Item Fest ID (Year) | Sched Tenant | Item Tenant | Marks | Tokens |');
summaryLines.push('|---|---|---|---|---|---|---|---|');

evData.schedBreakdown.filter(s => s.mark_count === 0).forEach(s => {
  summaryLines.push('| `' + s.id + '` | ' + s.item_code + ' (' + s.item_name + ') | `NULL` | `' + s.item_festival_id + '` (2027) | `' + s.schedule_tenant_id + '` | `' + s.item_tenant_id + '` | **0** | **' + s.token_count + '** |');
});

summaryLines.push('');
summaryLines.push('---');
summaryLines.push('');
summaryLines.push('## 4. Breakdown of the 13 Tokens Attached to the 19 Schedules (0 Marks)');
summaryLines.push('');
summaryLines.push('* **Total Token Count**: **13 tokens**');
summaryLines.push('* **Judge / Schedule Festival Mismatches**: **13** (All 13 judges have `festival_id = e80ad8e8...` [Year 2027] while schedule `festival_id = NULL`)');
summaryLines.push('* **Token Usage Status**: **13 Unused** (`is_used = false`)');
summaryLines.push('* **Associated Mark Entries**: **0**');
summaryLines.push('* **Classification**: Dependent records (`DEPENDENT RECORD — UNUSED TOKEN`).');
summaryLines.push('');
summaryLines.push('---');
summaryLines.push('');
summaryLines.push('## 5. Holistic Read-Only Evaluation of 59 Registration Tenant Mismatches');
summaryLines.push('');
summaryLines.push('* **Registration Tenant**: `d3ed1102-31a6-4e44-86ca-7a41c4359db1` (Sector Tenant)');
summaryLines.push('* **Participant Tenant**: Unit Tenant IDs (e.g. `090117b7...`, `9b1deb4d...`)');
summaryLines.push('* **Organisation Tenant**: Unit Tenant IDs (matching participant tenant)');
summaryLines.push('* **Item Tenant**: `d3ed1102-31a6-4e44-86ca-7a41c4359db1` (Sector Tenant)');
summaryLines.push('* **Result Tenants**: `d3ed1102-31a6-4e44-86ca-7a41c4359db1` (Sector Tenant)');
summaryLines.push('* **Mark Tenants**: `d3ed1102-31a6-4e44-86ca-7a41c4359db1` (Sector Tenant)');
summaryLines.push('* **Import Source**: CSV dataset imports (`junior_dataset`, `senior_dataset`, `general_dataset`)');
summaryLines.push('* **Holistic Finding**: Registration, item, result, and mark records were created under the Sector tenant ID, while participants and organisations were created under Unit tenant IDs. Updating `registrations.tenant_id` alone without adjusting items/results/marks would create new tenant mismatches.');
summaryLines.push('* **Classification**: `MANUAL/BATCH REVIEW REQUIRED`');

fs.writeFileSync(path.join(artDir, 'FORENSIC_MISMATCH_SUMMARY.md'), summaryLines.join('\n'));
console.log('Saved FORENSIC_MISMATCH_SUMMARY.md');


// ==============================================================================
// 3. FORENSIC_GROUPED_ROOT_CAUSES.md
// ==============================================================================
let groupLines = [];
groupLines.push('# Forensic Grouped Root Cause Analysis');
groupLines.push('');
groupLines.push('**Analysis Scope**: Grouping and Root Cause Isolation for Mismatches & Data Defects');
groupLines.push('**Date**: 2026-07-24');
groupLines.push('');
groupLines.push('---');
groupLines.push('');
groupLines.push('## 1. Distinction Between Verified Facts and Inferences');
groupLines.push('');
groupLines.push('* **VERIFIED FACT**: 35 schedules have `schedules.festival_id = NULL` while `items.festival_id = e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6` (Year 2027).');
groupLines.push('* **VERIFIED FACT**: 16 of those schedules contain 120 finalized mark entries and 31 judge tokens.');
groupLines.push('* **VERIFIED FACT**: 19 of those schedules contain 0 mark entries and 13 judge tokens.');
groupLines.push('* **VERIFIED FACT**: 59 registrations have sector tenant ID while linked participants have unit tenant IDs.');
groupLines.push('* **INFERENCE**: Schedule import function `execute_schedule_import_chunk` populated `item_id` and `tenant_id` but omitted `festival_id`.');
groupLines.push('* **INFERENCE**: Registration bulk import assigned the sector tenant ID to registrations instead of inheriting `participants.tenant_id`.');

fs.writeFileSync(path.join(artDir, 'FORENSIC_GROUPED_ROOT_CAUSES.md'), groupLines.join('\n'));
console.log('Saved FORENSIC_GROUPED_ROOT_CAUSES.md');


// ==============================================================================
// 4. FORENSIC_OPERATOR_DECISIONS.md
// ==============================================================================
let decLines = [];
decLines.push('# Revised Forensic Operator Decision Matrix');
decLines.push('');
decLines.push('**Scope**: Required Operator Review Options Prior to Remediation SQL');
decLines.push('**Date**: 2026-07-24');
decLines.push('');
decLines.push('> [!CAUTION]');
decLines.push('> **EVERY AUTHORITY DECISION AND AUTO-FIX STATUS IS UNAPPROVED**. No DDL, DML, migration repair command, or remediation SQL script is generated.');
decLines.push('');
decLines.push('---');
decLines.push('');
decLines.push('## Required Operator Decisions');
decLines.push('');
decLines.push('### Decision 1: 59 Registration Tenant Mismatches');
decLines.push('* **Option A**: Align `registrations.tenant_id` with `participants.tenant_id`.');
decLines.push('* **Option B**: Align `participants.tenant_id` with sector `registrations.tenant_id`.');
decLines.push('* **Option C**: Retain hybrid tenant structure if multi-tenant partitioning permits sector-level registration.');
decLines.push('');
decLines.push('### Decision 2: 35 Schedule Festival NULL State');
decLines.push('* **Option A**: Populate `schedules.festival_id` from `items.festival_id` (`e80ad8e8...` Year 2027).');
decLines.push('* **Option B**: Assign specific festival IDs per schedule slot manually.');
decLines.push('');
decLines.push('### Decision 3: Single Result Festival Mismatch');
decLines.push('* **Option A**: Transfer participant `34654458...` to festival 2027.');
decLines.push('* **Option B**: Update result festival ID to 2026.');
decLines.push('');
decLines.push('### Decision 4: 7 Registration Participant/Item Festival Mismatches');
decLines.push('* **Option A**: Transfer participants to 2027 festival.');
decLines.push('* **Option B**: Re-assign registrations to 2026 items.');
decLines.push('');
decLines.push('### Decision 5: 7 Published Results with `grade = NULL`');
decLines.push('* **Option A**: Inspect original scorecards to retrieve total scores.');
decLines.push('* **Option B**: Preserve `grade = NULL` without synthesizing performance grades.');
decLines.push('');
decLines.push('### Decision 6: Testing Token Revocation in Staging');
decLines.push('* **Option A**: Test token revocation schema in staging before any production execution.');

fs.writeFileSync(path.join(artDir, 'FORENSIC_OPERATOR_DECISIONS.md'), decLines.join('\n'));
console.log('Saved FORENSIC_OPERATOR_DECISIONS.md');
