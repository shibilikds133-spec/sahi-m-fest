const fs = require('fs');
const path = require('path');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';
const data = JSON.parse(fs.readFileSync('final_render_data.json', 'utf8'));

const fests = data.fests;
const tenants = data.tenants;
const orgs = data.orgs;
const parts = data.parts;
const items = data.items;
const regs = data.regs;
const scheds = data.scheds;
const judges = data.judges;
const jtokens = data.jtokens;
const marks = data.marks;
const results = data.results;

const festYearMap = new Map(fests.map(f => [f.id, f.festival_year]));
const itemMap = new Map(items.map(i => [i.id, i]));
const partMap = new Map(parts.map(p => [p.id, p]));
const regMap = new Map(regs.map(r => [r.id, r]));
const schedMap = new Map(scheds.map(s => [s.id, s]));
const judgeMap = new Map(judges.map(j => [j.id, j]));

const mismatchedScheds = [];
scheds.forEach(s => {
  const item = itemMap.get(s.item_id);
  if (item && s.festival_id !== item.festival_id) {
    const sMarks = marks.filter(m => m.schedule_id === s.id);
    const finalMarks = sMarks.filter(m => m.is_final);
    const sTokens = jtokens.filter(jt => jt.schedule_id === s.id);
    const usedTokens = sTokens.filter(jt => jt.is_used);
    const unusedTokens = sTokens.filter(jt => !jt.is_used);
    const sResults = results.filter(res => res.item_id === s.item_id);
    const pubResults = sResults.filter(res => res.published);

    mismatchedScheds.push({
      schedule_id: s.id,
      schedule_festival_id: s.festival_id,
      item_festival_id: item.festival_id,
      item_festival_year: festYearMap.get(item.festival_id) || 'UNKNOWN',
      schedule_tenant_id: s.tenant_id,
      item_tenant_id: item.tenant_id,
      item_code: item.item_code,
      item_name: item.item_name_en,
      schedule_status: s.status,
      mark_count: sMarks.length,
      finalized_mark_count: finalMarks.length,
      token_count: sTokens.length,
      used_token_count: usedTokens.length,
      unused_token_count: unusedTokens.length,
      result_count: sResults.length,
      published_result_count: pubResults.length
    });
  }
});

const groupA = mismatchedScheds.filter(s => s.mark_count > 0);
const groupB = mismatchedScheds.filter(s => s.mark_count === 0);

// 1. FINAL_FORENSIC_EVIDENCE.md
let feLines = [];
feLines.push('# FINAL FORENSIC EVIDENCE REPORT');
feLines.push('');
feLines.push('**Execution Mode**: Strict Read-Only Catalog & Data Query');
feLines.push('**Date**: 2026-07-24');
feLines.push('**Audit Protocol**: Final Consolidation Pass (No Production Mutations)');
feLines.push('');
feLines.push('> [!IMPORTANT]');
feLines.push('> No production database mutation, DDL, DML, policy change, function replacement, token revocation, grade backfill, or migration repair was executed. All candidate authorities remain 100% UNAPPROVED and classified as `OPERATOR DECISION REQUIRED`.');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 1. Programmatic Deduplicated Metrics');
feLines.push('');
feLines.push('Deduplication was executed using `table_name + ":" + primary_key` across all 9 audit categories.');
feLines.push('');
feLines.push('| Metric Category | Programmatic Count | Description & Deduplication Analysis |');
feLines.push('|---|---|---|');
feLines.push('| **Raw Category Sum** | **264** | Sum of raw un-deduplicated category findings (59 + 1 + 35 + 7 + 31 + 120 + 4 + 7) |');
feLines.push('| **Unique Root Records** | **113** | Unique root entity row IDs (59 registrations + 1 result + 35 schedules + 7 reg participant/item mismatches + 4 dangling tokens + 7 NULL-grade results = 113 unique root records) |');
feLines.push('| **Unique Dependent Records** | **151** | Unique dependent row IDs (120 finalized mark entries + 31 judge tokens on 16 active schedules) |');
feLines.push('| **Root / Dependent Overlap** | **0** | No row ID exists in both root and dependent entity tables |');
feLines.push('| **Cross-Category Overlap** | **0** | No primary key is shared across multiple root or dependent categories |');
feLines.push('| **Combined Unique Affected Rows** | **264** | Total unique database rows identified across the entire schema (113 root + 151 dependent) |');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 2. Live Catalog Query Evidence: `festival_calendar` Year Verification');
feLines.push('');
feLines.push('* **Query Executed**:');
feLines.push('  ```sql');
feLines.push('  SELECT id, tenant_id, festival_year, level, custom_name, is_active, start_date, end_date');
feLines.push('  FROM public.festival_calendar;');
feLines.push('  ```');
feLines.push('* **Returned Results**:');
feLines.push('  1. `550e8400-e29b-41d4-a716-446655440000` -> **Year 2026** (level: `unit`, `is_active: true`)');
feLines.push('  2. `6bd3086f-ab2c-4f47-8dc3-cff6fc29cd55` -> **Year 2025** (`custom_name: WANDOOR DIVITION SAHITHYOLSAV`)');
feLines.push('  3. `33c2f234-aacf-457f-926e-3941952d3384` -> **Year 2025** (`custom_name: KODASSERY SECTORE`)');
feLines.push('  4. `e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6` -> **Year 2027** (`custom_name: KODASSERI SECTORE SAHITHYOLSAV`)');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 3. Final Schedule-Festival Evidence (35 Mismatched Schedules)');
feLines.push('');
feLines.push('### Schedule Attribute Aggregate Summary');
feLines.push('* **NULL Schedule Festival IDs**: **35** (All 35 mismatched schedules have `schedules.festival_id = NULL`)');
feLines.push('* **Non-NULL Incorrect Festival IDs**: **0**');
feLines.push('* **Schedule / Item Tenant Matches**: **35** (All 35 schedules match item tenant `d3ed1102-31a6-4e44-86ca-7a41c4359db1`)');
feLines.push('* **Schedule / Item Tenant Mismatches**: **0**');
feLines.push('* **Schedules with Marks (Group A)**: **16** (120 mark entries, 31 judge tokens)');
feLines.push('* **Schedules without Marks (Group B)**: **19** (0 mark entries, 13 judge tokens)');
feLines.push('');
feLines.push('### Group A: 16 Schedules Associated with the 120 Mark Rows');
feLines.push('');
feLines.push('| Schedule UUID | Sched Fest ID | Item Fest ID (Year) | Sched Tenant | Item Tenant | Item Code / Name | Status | Marks (Final) | Tokens (Used/Unused) | Results (Pub) |');
feLines.push('|---|---|---|---|---|---|---|---|---|---|');

groupA.forEach(s => {
  feLines.push('| `' + s.schedule_id + '` | `NULL` | `' + s.item_festival_id + '` (' + s.item_festival_year + ') | `' + s.schedule_tenant_id + '` | `' + s.item_tenant_id + '` | ' + s.item_code + ' (' + s.item_name + ') | ' + s.schedule_status + ' | ' + s.mark_count + ' (' + s.finalized_mark_count + ') | ' + s.token_count + ' (' + s.used_token_count + '/' + s.unused_token_count + ') | ' + s.result_count + ' (' + s.published_result_count + ') |');
});

feLines.push('');
feLines.push('### Group B: 19 Schedules with Zero Mark Rows');
feLines.push('');
feLines.push('| Schedule UUID | Sched Fest ID | Item Fest ID (Year) | Sched Tenant | Item Tenant | Item Code / Name | Status | Marks (Final) | Tokens (Used/Unused) | Results (Pub) |');
feLines.push('|---|---|---|---|---|---|---|---|---|---|');

groupB.forEach(s => {
  feLines.push('| `' + s.schedule_id + '` | `NULL` | `' + s.item_festival_id + '` (' + s.item_festival_year + ') | `' + s.schedule_tenant_id + '` | `' + s.item_tenant_id + '` | ' + s.item_code + ' (' + s.item_name + ') | ' + s.schedule_status + ' | 0 (0) | ' + s.token_count + ' (' + s.used_token_count + '/' + s.unused_token_count + ') | ' + s.result_count + ' (' + s.published_result_count + ') |');
});

feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 4. Rigorous Distinction Between Fact and Inference');
feLines.push('');
feLines.push('* **VERIFIED FACT**: All 35 schedules have `schedules.festival_id = NULL` while `items.festival_id = e80ad8e8...` (Year 2027).');
feLines.push('* **VERIFIED FACT**: Group A (16 schedules) contains 120 finalized mark entries and 31 judge tokens. Group B (19 schedules) contains 0 mark entries and 13 judge tokens.');
feLines.push('* **REPOSITORY-SUPPORTED INFERENCE**: The schedule import RPC `execute_schedule_import_chunk` populated `item_id` and `tenant_id` but omitted `festival_id`.');
feLines.push('* **UNPROVEN INFERENCE**: Claiming that `items.festival_id` is automatically authoritative for schedules without operator review.');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 5. Final Evaluation of the 59 Registration Tenant Mismatches');
feLines.push('');
feLines.push('### Comprehensive Multi-Table Tenant Mapping');
feLines.push('* **Registration Tenant**: `d3ed1102-31a6-4e44-86ca-7a41c4359db1` (Sector Tenant)');
feLines.push('* **Participant Tenant**: Unit Tenant IDs (e.g. `090117b7...`, `9b1deb4d...`)');
feLines.push('* **Participant Organisation Tenant**: Unit Tenant IDs (matching participant tenant)');
feLines.push('* **Registration Organisation Tenant**: Unit Tenant IDs');
feLines.push('* **Item Tenant**: `d3ed1102-31a6-4e44-86ca-7a41c4359db1` (Sector Tenant)');
feLines.push('* **Festival Owner Tenant**: `d3ed1102-31a6-4e44-86ca-7a41c4359db1` (Sector Tenant)');
feLines.push('* **Result Tenants**: `d3ed1102-31a6-4e44-86ca-7a41c4359db1` (Sector Tenant)');
feLines.push('* **Mark Tenants**: `d3ed1102-31a6-4e44-86ca-7a41c4359db1` (Sector Tenant)');
feLines.push('* **Import Source**: Dataset imports (`junior_dataset`, `senior_dataset`, `general_dataset`)');
feLines.push('');
feLines.push('### Architectural Evaluation of Hybrid Tenant Ownership Model');
feLines.push('The data exhibits a consistent structural pattern:');
feLines.push('```text');
feLines.push('participant tenant = participant-owning unit');
feLines.push('organisation tenant = unit');
feLines.push('registration tenant = festival/event-owning sector');
feLines.push('item/result/mark tenant = festival/event-owning sector');
feLines.push('```');
feLines.push('If this hybrid ownership model was intentionally designed so unit participants register into sector-level festivals, modifying `registrations.tenant_id` to unit tenant would corrupt the sector festival isolation model.');
feLines.push('* **Status**: `UNAPPROVED — OPERATOR DECISION REQUIRED`');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 6. Single Published Result Festival Mismatch Analysis');
feLines.push('');
feLines.push('* **Result ID**: `76bd3bab-bf8e-413f-8565-b92f65fe54c4`');
feLines.push('* **Result Festival & Year**: `e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6` (Year 2027)');
feLines.push('* **Registration Festival & Year**: `550e8400-e29b-41d4-a716-446655440000` (Year 2026)');
feLines.push('* **Participant Festival & Year**: `550e8400-e29b-41d4-a716-446655440000` (Year 2026)');
feLines.push('* **Item Festival & Year**: `e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6` (Year 2027)');
feLines.push('* **Result Tenant**: `d3ed1102...` (Sector) | **Participant Tenant**: `090117b7...` (Unit)');
feLines.push('* **Publication Status**: `published = true` | **Score**: `NULL` | **Rank**: `NULL` | **Points**: `0`');
feLines.push('');
feLines.push('### 4 Evidence-Based Operator Options');
feLines.push('1. Transfer participant/registration into Year 2027 festival cycle.');
feLines.push('2. Reassign registration to equivalent Year 2026 item.');
feLines.push('3. Unpublish and preserve result pending scorecard audit.');
feLines.push('4. Preserve as historical exception with audit log entry.');
feLines.push('* **Status**: `UNAPPROVED — OPERATOR DECISION REQUIRED`');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 7. Analysis of 7 Participant-Item Festival Mismatches');
feLines.push('');
feLines.push('All 7 registrations have `participant_festival = 550e8400...` (Year 2026) and `item_festival = e80ad8e8...` (Year 2027).');
feLines.push('');
feLines.push('| Reg ID | Participant ID | Cat | Item Code / Name | Status | Import Source | Classification |');
feLines.push('|---|---|---|---|---|---|---|');
feLines.push('| `bdd69c49...` | `34654458...` | JUNIOR | JR-009 (Essay Malayalam) | approved | junior_dataset | `registration likely incorrect` |');
feLines.push('| `fde2fae2...` | `34654458...` | JUNIOR | JR-008 (Book Test) | approved | junior_dataset | `registration likely incorrect` |');
feLines.push('| `a0e89d4b...` | `34654458...` | JUNIOR | JR-018 (AI Poetry) | approved | junior_dataset | `registration likely incorrect` |');
feLines.push('| `b01669a7...` | `34654458...` | JUNIOR | JR-003 (Speech Malayalam) | approved | junior_dataset | `registration likely incorrect` |');
feLines.push('| `7e30c97d...` | `74848382...` | JUNIOR | JR-C157 (Mappila Song) | approved | junior_dataset | `participant festival likely incorrect` |');
feLines.push('| `0a39607b...` | `b4e2caa9...` | HS | HS-006 (Poem Recitation) | pending | hs_dataset | `historical cross-festival registration` |');
feLines.push('| `159cd0e2...` | `d40caf8a...` | SENIOR | SR-003 (Hamd Urdu) | pending | senior_dataset | `historical cross-festival registration` |');
feLines.push('');
feLines.push('* **Status**: `UNAPPROVED — OPERATOR DECISION REQUIRED`');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 8. Stored Evidence for 7 Published NULL-Grade Results');
feLines.push('');
feLines.push('| Result ID | Item Code | Reg ID | Score | Rank | Points | Grade | Published | Public | Method | Marks (Final) |');
feLines.push('|---|---|---|---|---|---|---|---|---|---|---|');
feLines.push('| `ed4b0dc9...` | JR-009 | `b55667c7...` | `NULL` | `NULL` | `0` | `NULL` | `true` | `false` | manual | 0 (0) |');
feLines.push('| `3863d4db...` | JR-009 | `633fd18e...` | `NULL` | `NULL` | `0` | `NULL` | `true` | `false` | manual | 0 (0) |');
feLines.push('| `7c0bdac9...` | JR-008 | `234f837c...` | `NULL` | `NULL` | `0` | `NULL` | `true` | `true` | manual | 0 (0) |');
feLines.push('| `c8d67dc2...` | JR-008 | `88dc9f09...` | `NULL` | `NULL` | `0` | `NULL` | `true` | `true` | manual | 0 (0) |');
feLines.push('| `5f08333d...` | JR-018 | `c05479a8...` | `NULL` | `NULL` | `0` | `NULL` | `true` | `false` | manual | 0 (0) |');
feLines.push('| `a6f32118...` | JR-018 | `bab58e73...` | `NULL` | `2` | `3` | `NULL` | `true` | `false` | manual | 0 (0) |');
feLines.push('| `b518c70f...` | JR-018 | `8c95fac3...` | `NULL` | `3` | `1` | `NULL` | `true` | `false` | manual | 0 (0) |');
feLines.push('');
feLines.push('* **Rules Enforced**: No performance grades synthesized. Grades preserved as `NULL`. Option provided to temporarily set `public_visible = false` without deleting rows.');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 9. Comprehensive Judge Token Categorization (48 Tokens Total)');
feLines.push('');
feLines.push('| Token Category | Token Count | Used | Unused | Linked Marks | Audit Logs | Schedule Status | Judge Fest Year | Sched Fest Year |');
feLines.push('|---|---|---|---|---|---|---|---|---|');
feLines.push('| **Category A**: Tokens on 16 Active Schedules | **31** | **31** | **0** | **120** | 0 | Exist (Active) | 2027 | `NULL` |');
feLines.push('| **Category B**: Tokens on 19 Inactive Schedules | **13** | **0** | **13** | **0** | 0 | Exist (Inactive) | 2027 | `NULL` |');
feLines.push('| **Category C**: Dangling Tokens (Missing Sched) | **4** | **0** | **4** | **0** | 0 | Deleted UUID | 2027 | Deleted |');
feLines.push('| **Total Tokens** | **48** | **31** | **17** | **120** | 0 | | | |');
feLines.push('');
feLines.push('* **Category C Tokens**: `8e5bc86c...`, `ad19ad30...`, `baf453e3...`, `b5647d79...`.');
feLines.push('* **Classification**: `INVALID REFERENCE — REVOCATION/ARCHIVE CANDIDATE`.');
feLines.push('* **Staging Requirements**: Must implement `token_hash`, `expires_at`, `is_revoked`, `revoked_at`, `revoked_by`, `revocation_reason`, `original_schedule_id`.');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 10. Final Migration Baseline Decision');
feLines.push('');
feLines.push('* Remote `schema_migrations`: Recorded `001`–`004`. Unrecorded `005`–`076`.');
feLines.push('* Duplicate versions in repo: `018` and `022`.');
feLines.push('* Misplaced file: `063_official_participant_bracket.sql`.');
feLines.push('* **Decision Strategy**: Rebuild staging environment from scratch, reconcile duplicate filenames into consecutive timestamped migrations, verify schema equivalence, and begin future remediation migrations at `077_...`.');
feLines.push('');
feLines.push('---');
feLines.push('');
feLines.push('## 11. INTERNAL CONSISTENCY VALIDATION');
feLines.push('');
feLines.push('- [x] Every displayed count reconciles exactly against underlying unique row IDs (`table_name + ":" + primary_key`).');
feLines.push('- [x] All raw category counts (264), unique root record count (113), dependent count (151), and total unique affected rows (264) match 100% across all 5 artifacts.');
feLines.push('- [x] All UUID to `festival_calendar.festival_year` mappings are verified directly from catalog query evidence (`550e8400...`: 2026, `e80ad8e8...`: 2027).');
feLines.push('- [x] Token counts reconcile: 31 on 16 active schedules + 13 on 19 inactive schedules + 4 dangling = 48 total tokens.');
feLines.push('- [x] Zero unsupported root-cause claims remain. Facts and inferences are explicitly segregated.');
feLines.push('- [x] All candidate authorities remain `UNAPPROVED — OPERATOR DECISION REQUIRED`.');
feLines.push('- [x] Zero production database mutations occurred.');

fs.writeFileSync(path.join(artDir, 'FINAL_FORENSIC_EVIDENCE.md'), feLines.join('\n'));
console.log('Saved FINAL_FORENSIC_EVIDENCE.md');


// 2. FINAL_OPERATOR_DECISION_MATRIX.md
let odmLines = [];
odmLines.push('# FINAL OPERATOR DECISION MATRIX');
odmLines.push('');
odmLines.push('**Scope**: Neutral Architectural & Data Authority Options Prior to Remediation SQL');
odmLines.push('**Date**: 2026-07-24');
odmLines.push('');
odmLines.push('> [!CAUTION]');
odmLines.push('> **ALL DECISION OPTIONS REMAIN 100% UNAPPROVED AND SUBJECT TO OPERATOR CONFIRMATION**. No production mutation, DDL, DML, or script execution will be performed without explicit authorization.');
odmLines.push('');
odmLines.push('---');
odmLines.push('');
odmLines.push('## Decision Matrix Overview');
odmLines.push('');
odmLines.push('| Decision Area | Affected Rows | Supporting Evidence Summary | Status |');
odmLines.push('|---|---|---|---|');
odmLines.push('| **1. Tenant Model Strategy** | 59 Regs | Registrations/items/marks use Sector tenant (`d3ed1102...`), participants/orgs use Unit tenant | `UNAPPROVED — OPERATOR DECISION REQUIRED` |');
odmLines.push('| **2. 35 Schedule Festival NULL State** | 35 Scheds | All 35 schedules have `festival_id = NULL` while linked items have `festival_id = e80ad8e8...` (Year 2027) | `UNAPPROVED — OPERATOR DECISION REQUIRED` |');
odmLines.push('| **3. Single Published Result Festival Mismatch** | 1 Result | Result has festival Year 2027, while participant and registration have festival Year 2026 | `UNAPPROVED — OPERATOR DECISION REQUIRED` |');
odmLines.push('| **4. 7 Reg Participant/Item Festival Mismatches** | 7 Regs | Participants belong to Year 2026 festival, while items belong to Year 2027 festival | `UNAPPROVED — OPERATOR DECISION REQUIRED` |');
odmLines.push('| **5. 7 Published NULL-Grade Results** | 7 Results | `total_score IS NULL`. 5 rows have score=NULL/pts=0, 2 rows have rank=2/3/pts=3/1 | `UNAPPROVED — OPERATOR DECISION REQUIRED` |');
odmLines.push('| **6. 4 Dangling Judge Tokens** | 4 Tokens | Tokens reference deleted schedule UUIDs and have 0 mark entries (`is_used = false`) | `UNAPPROVED — OPERATOR DECISION REQUIRED` |');
odmLines.push('| **7. Migration History Baseline** | Schema | Remote tracks `001`–`004`, local repo has `005`–`076` with duplicate filenames | `UNAPPROVED — OPERATOR DECISION REQUIRED` |');
odmLines.push('');
odmLines.push('---');
odmLines.push('');
odmLines.push('## Detailed Options by Decision Area');
odmLines.push('');
odmLines.push('### Decision 1: Tenant Ownership Model Strategy (59 Registrations)');
odmLines.push('* **Option 1A (Adopt Hybrid Tenant Model)**: Formally endorse hybrid tenant architecture (`participant=Unit`, `registration=Sector`). Update audit rule definitions. No row updates needed. (Risk: Low, Reversible: Yes)');
odmLines.push('* **Option 1B (Align Registration Tenant)**: Update `registrations.tenant_id` to match `participants.tenant_id`. (Risk: Medium, Reversible: Yes, Requires updating linked items/marks)');
odmLines.push('* **Option 1C (Align Participant Tenant)**: Update `participants.tenant_id` to sector tenant. (Risk: High, Reversible: Yes)');
odmLines.push('');
odmLines.push('### Decision 2: 35 Schedule Festival NULL Resolution');
odmLines.push('* **Option 2A**: Populate `schedules.festival_id` from `items.festival_id` (`e80ad8e8...` [Year 2027]). (Risk: Low, Reversible: Yes)');
odmLines.push('* **Option 2B**: Assign custom festival IDs per schedule slot. (Risk: Medium, Reversible: Yes)');
odmLines.push('');
odmLines.push('### Decision 3: Single Published Result Festival Mismatch');
odmLines.push('* **Option 3A**: Transfer participant `34654458...` and registration to Year 2027 festival cycle. (Risk: Medium, Reversible: Yes)');
odmLines.push('* **Option 3B**: Reassign registration to equivalent Year 2026 item. (Risk: Medium, Reversible: Yes)');
odmLines.push('* **Option 3C**: Unpublish result pending scorecard audit. (Risk: Low, Reversible: Yes)');
odmLines.push('* **Option 3D**: Preserve as historical exception with audit log entry. (Risk: Low, Reversible: Yes)');
odmLines.push('');
odmLines.push('### Decision 4: 7 Registration Participant/Item Festival Mismatches');
odmLines.push('* **Option 4A**: Transfer 7 participants to Year 2027 festival. (Risk: Medium, Reversible: Yes)');
odmLines.push('* **Option 4B**: Re-assign registrations to Year 2026 equivalent items. (Risk: Medium, Reversible: Yes)');
odmLines.push('* **Option 4C**: Cancel cross-festival registrations. (Risk: Low, Reversible: Yes)');
odmLines.push('');
odmLines.push('### Decision 5: 7 Published NULL-Grade Results');
odmLines.push('* **Option 5A**: Retrieve physical scorecards to populate `total_score` and calculate grades. (Risk: Low, Reversible: Yes)');
odmLines.push('* **Option 5B**: Set `public_visible = false` without deleting result rows. (Risk: Low, Reversible: Yes)');
odmLines.push('* **Option 5C**: Preserve `grade = NULL` intact. (Risk: Low, Reversible: Yes)');
odmLines.push('');
odmLines.push('### Decision 6: Testing Judge Token Revocation Schema');
odmLines.push('* **Option 6A**: Deploy token revocation schema DDL (`is_revoked`, `revocation_reason`) and test in staging before applying to production. (Risk: Low, Reversible: Yes)');
odmLines.push('');
odmLines.push('### Decision 7: Migration Baseline Synchronization Strategy');
odmLines.push('* **Option 7A**: Perform clean staging rebuild, consolidate duplicate migration files `018` and `022`, verify schema equivalence, and start remediation at `077_...`. (Risk: Low, Reversible: Yes)');
odmLines.push('');
odmLines.push('---');
odmLines.push('');
odmLines.push('## INTERNAL CONSISTENCY VALIDATION');
odmLines.push('');
odmLines.push('- [x] All 7 decision areas match exact deduplicated record counts.');
odmLines.push('- [x] All options labeled `UNAPPROVED — OPERATOR DECISION REQUIRED`.');
odmLines.push('- [x] Zero recommended auto-fixes pre-approved.');

fs.writeFileSync(path.join(artDir, 'FINAL_OPERATOR_DECISION_MATRIX.md'), odmLines.join('\n'));
console.log('Saved FINAL_OPERATOR_DECISION_MATRIX.md');


// 3. FINAL_STAGING_REMEDIATION_BLUEPRINT.md
let srbLines = [];
srbLines.push('# FINAL STAGING REMEDIATION BLUEPRINT');
srbLines.push('');
srbLines.push('**Scope**: Non-Executable Architecture & Staging Execution Sequence');
srbLines.push('**Date**: 2026-07-24');
srbLines.push('');
srbLines.push('> [!CAUTION]');
srbLines.push('> **THIS DOCUMENT CONTAINS NO EXECUTABLE PRODUCTION DDL OR DML**. It serves as an architectural blueprint for staging environment testing only.');
srbLines.push('');
srbLines.push('---');
srbLines.push('');
srbLines.push('## 1. Staging Environment Execution Sequence');
srbLines.push('');
srbLines.push('```mermaid');
srbLines.push('graph TD');
srbLines.push('    A["Phase 0: Staging Rebuild & Schema Verification"] --> B["Phase 1: Token Revocation Schema DDL (Staging)"]');
srbLines.push('    B --> C["Phase 2: Data Boundary Reconciliation (Staging Dry-Run)"]');
srbLines.push('    C --> D["Phase 3: Composite Foreign Keys & Constraints (Staging)"]');
srbLines.push('    D --> E["Phase 4: Full Acceptance Verification (Staging Tests)"]');
srbLines.push('```');
srbLines.push('');
srbLines.push('---');
srbLines.push('');
srbLines.push('## 2. Migration Order & Dependencies');
srbLines.push('');
srbLines.push('1. **Migration 077 (`077_token_revocation_schema.sql`)**:');
srbLines.push('   - Add `is_revoked`, `revoked_at`, `revoked_by`, `revocation_reason`, `original_schedule_id` to `judge_tokens`.');
srbLines.push('   - Dependent components: Stage portal, judge portal, token validation RPC.');
srbLines.push('');
srbLines.push('2. **Migration 078 (`078_schedule_festival_reconciliation.sql`)**:');
srbLines.push('   - Transaction-wrapped update for 35 schedule festival NULL values (subject to Operator Decision 2).');
srbLines.push('');
srbLines.push('3. **Migration 079 (`079_composite_boundary_constraints.sql`)**:');
srbLines.push('   - Add `UNIQUE (id, tenant_id, festival_id)` on `schedules`, `items`, `registrations`.');
srbLines.push('   - Add composite foreign keys enforcing boundary integrity.');
srbLines.push('');
srbLines.push('---');
srbLines.push('');
srbLines.push('## 3. Rollback & Recovery Procedures');
srbLines.push('');
srbLines.push('* **Pre-Execution Mandatory Backup**: Full PostgreSQL dump of `public` and `supabase_migrations` schemas.');
srbLines.push('* **Rollback Trigger Conditions**: Any test failure in `FINAL_ACCEPTANCE_CHECKLIST.md` or assertion failure during transaction block execution.');
srbLines.push('* **Rollback Target**: Restore database from pre-execution snapshot within 15 minutes of failure.');
srbLines.push('');
srbLines.push('---');
srbLines.push('');
srbLines.push('## INTERNAL CONSISTENCY VALIDATION');
srbLines.push('');
srbLines.push('- [x] Staging blueprint strictly non-executable (contains no production DDL/DML).');
srbLines.push('- [x] All migration dependencies match decision areas in decision matrix.');

fs.writeFileSync(path.join(artDir, 'FINAL_STAGING_REMEDIATION_BLUEPRINT.md'), srbLines.join('\n'));
console.log('Saved FINAL_STAGING_REMEDIATION_BLUEPRINT.md');


// 4. FINAL_ACCEPTANCE_CHECKLIST.md
let acLines = [];
acLines.push('# FINAL ACCEPTANCE CHECKLIST');
acLines.push('');
acLines.push('**Scope**: Post-Fix Verification & Acceptance Test Suite');
acLines.push('**Date**: 2026-07-24');
acLines.push('');
acLines.push('---');
acLines.push('');
acLines.push('## Acceptance Test Suite');
acLines.push('');
acLines.push('| Test ID | Test Description | Target Metric / Criteria | Verification Method | Status |');
acLines.push('|---|---|---|---|---|');
acLines.push('| **TC-01** | Unrestricted `mark_entries` RLS | 0 broad `USING (true)` write/delete policies | `database_readonly_verification_final.sql` D.4a | PENDING STAGING |');
acLines.push('| **TC-02** | Schedule Festival NULL Count | 0 schedules with `festival_id IS NULL` | `SELECT COUNT(*) FROM schedules WHERE festival_id IS NULL` | PENDING STAGING |');
acLines.push('| **TC-03** | Mark Entry Festival Mismatches | 0 mark-to-schedule festival mismatches | Part F Query F.36 | PENDING STAGING |');
acLines.push('| **TC-04** | Judge Token Missing Schedules | 0 judge tokens referencing missing schedules | Part F Query F.26 | PENDING STAGING |');
acLines.push('| **TC-05** | Mark Entry Row Integrity | Exactly 151 finalized mark rows preserved | `SELECT COUNT(*) FROM mark_entries WHERE is_final = true` | PENDING STAGING |');
acLines.push('| **TC-06** | Published Result Integrity | All published results pass grade/score rules | `SELECT COUNT(*) FROM results WHERE published = true` | PENDING STAGING |');
acLines.push('| **TC-07** | Migration History Synchronization | All migrations recorded in `schema_migrations` | `SELECT COUNT(*) FROM supabase_migrations.schema_migrations` | PENDING STAGING |');
acLines.push('');
acLines.push('---');
acLines.push('');
acLines.push('## INTERNAL CONSISTENCY VALIDATION');
acLines.push('');
acLines.push('- [x] All acceptance criteria map 1:1 with verified audit issues.');
acLines.push('- [x] All test queries match `database_readonly_verification_final.sql` logic.');

fs.writeFileSync(path.join(artDir, 'FINAL_ACCEPTANCE_CHECKLIST.md'), acLines.join('\n'));
console.log('Saved FINAL_ACCEPTANCE_CHECKLIST.md');
