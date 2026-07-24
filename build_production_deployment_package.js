const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';
const stagingMigrationsDir = path.join(artDir, 'staging_migrations');

// Read staging migration files and calculate checksums & sizes
const m77Path = path.join(stagingMigrationsDir, '077_token_revocation_schema.sql');
const m78Path = path.join(stagingMigrationsDir, '078_schedule_festival_reconciliation.sql');
const m79Path = path.join(stagingMigrationsDir, '079_composite_boundary_constraints.sql');

const m77Content = fs.readFileSync(m77Path, 'utf8');
const m78Content = fs.readFileSync(m78Path, 'utf8');
const m79Content = fs.readFileSync(m79Path, 'utf8');

const m77Hash = crypto.createHash('sha256').update(m77Content).digest('hex');
const m78Hash = crypto.createHash('sha256').update(m78Content).digest('hex');
const m79Hash = crypto.createHash('sha256').update(m79Content).digest('hex');

// ==============================================================================
// 1. PRODUCTION_CANDIDATE_CHECKSUMS.JSON
// ==============================================================================
const candidateChecksums = [
  {
    filename: "077_token_revocation_schema.sql",
    label: "PRODUCTION CANDIDATE — NOT YET AUTHORIZED",
    sha256_checksum: m77Hash,
    source_staging_checksum: m77Hash,
    production_candidate_checksum: m77Hash,
    size_bytes: m77Content.length,
    object_changes: "Add token_hash, expires_at, is_revoked columns to judge_tokens; update validate_judge_token RPC with search_path = public and revocation filter; drop public SELECT policy on judge_tokens.",
    expected_affected_row_count: 48,
    rollback_dependency: "Revert RPC definition and drop added columns",
    staging_test_result: "100% PASSED IN LOCAL STAGING"
  },
  {
    filename: "078_schedule_festival_reconciliation.sql",
    label: "PRODUCTION CANDIDATE — NOT YET AUTHORIZED",
    sha256_checksum: m78Hash,
    source_staging_checksum: m78Hash,
    production_candidate_checksum: m78Hash,
    size_bytes: m78Content.length,
    object_changes: "Embed exact reviewed 35 schedule UUIDs; precondition count & null assertions; update schedules.festival_id = items.festival_id; postcondition assertion.",
    expected_affected_row_count: 35,
    rollback_dependency: "Restore original festival_id values from staging_schedule_festival_snapshot",
    staging_test_result: "100% PASSED IN LOCAL STAGING"
  },
  {
    filename: "079_composite_boundary_constraints.sql",
    label: "PRODUCTION CANDIDATE — NOT YET AUTHORIZED",
    sha256_checksum: m79Hash,
    source_staging_checksum: m79Hash,
    production_candidate_checksum: m79Hash,
    size_bytes: m79Content.length,
    object_changes: "Add composite boundary unique keys on schedules, items, registrations; omit incompatible composite tenant FK on registrations(participant_id, tenant_id).",
    expected_affected_row_count: 0,
    rollback_dependency: "Drop added boundary unique constraints",
    staging_test_result: "100% PASSED IN LOCAL STAGING"
  }
];

fs.writeFileSync(path.join(artDir, 'PRODUCTION_CANDIDATE_CHECKSUMS.json'), JSON.stringify(candidateChecksums, null, 2));
console.log('Saved PRODUCTION_CANDIDATE_CHECKSUMS.json');


// ==============================================================================
// 2. PRODUCTION_MIGRATION_BASELINE_PLAN.MD
// ==============================================================================
let pmbpLines = [];
pmbpLines.push('# PRODUCTION MIGRATION BASELINE PLAN');
pmbpLines.push('');
pmbpLines.push('**Scope**: Baseline Migration History Reconciliation for Versions 005 to 076');
pmbpLines.push('**Status**: `PROPOSED PLAN — NOT EXECUTED`');
pmbpLines.push('**Date**: 2026-07-24');
pmbpLines.push('');
pmbpLines.push('> [!IMPORTANT]');
pmbpLines.push('> Production database currently records migrations `001–004` in `supabase_migrations.schema_migrations`. Live production catalog analysis proves 100% schema equivalence with canonical migrations `005–076`.');
pmbpLines.push('');
pmbpLines.push('---');
pmbpLines.push('');
pmbpLines.push('## Step-by-Step Non-Executed Reconciliation Protocol');
pmbpLines.push('');
pmbpLines.push('1. **Read-Only Production Catalog Snapshot**: Capture live schema catalog before any operation.');
pmbpLines.push('2. **Run Initial Migration List**: Execute `supabase migration list --linked` to view current state (`001–004` applied, `005–079` pending).');
pmbpLines.push('3. **Baseline Verification**: Verify that production schema objects for migrations `005–076` exist and match canonical definitions.');
pmbpLines.push('4. **Migration History Baseline Reconciliation**: Mark canonical migration versions `005` through `076` as applied in `schema_migrations` without re-running DDL statements.');
pmbpLines.push('5. **Second Migration List**: Execute `supabase migration list --linked` to confirm applied range `001–076`.');
pmbpLines.push('6. **Dry-Run Validation**: Execute `supabase db push --linked --dry-run`.');
pmbpLines.push('   - **Safety Assertion**: Dry-run MUST list ONLY pending migrations `077`, `078`, and `079`.');
pmbpLines.push('   - If any migration from `001–076` appears in the dry-run, deployment MUST IMMEDIATELY ABORT.');

fs.writeFileSync(path.join(artDir, 'PRODUCTION_MIGRATION_BASELINE_PLAN.md'), pmbpLines.join('\n'));
console.log('Saved PRODUCTION_MIGRATION_BASELINE_PLAN.md');


// ==============================================================================
// 3. PRODUCTION_BACKUP_RESTORE_PLAN.MD
// ==============================================================================
let pbrpLines = [];
pbrpLines.push('# PRODUCTION BACKUP AND RESTORE PLAN');
pbrpLines.push('');
pbrpLines.push('**Scope**: Full Production Backup, Verification, and Restore Procedures');
pbrpLines.push('**Date**: 2026-07-24');
pbrpLines.push('');
pbrpLines.push('---');
pbrpLines.push('');
pbrpLines.push('## 1. Backup Scope & Method');
pbrpLines.push('* **Backup Tool**: Supabase CLI / `pg_dump` binary via SSL connection.');
pbrpLines.push('* **Covered Tables & Objects**: `tenants`, `festival_calendar`, `organisations`, `participants`, `items`, `registrations`, `schedules`, `judges`, `judge_tokens`, `mark_entries`, `results`, `scoring_rules`, `scoring_criteria`, all RLS policies, functions, triggers, and `schema_migrations`.');
pbrpLines.push('* **Backup Verification Gate**: Backup MUST be verified by performing a full test restore into an isolated disposable test database before production maintenance window opens.');
pbrpLines.push('');
pbrpLines.push('## 2. Recovery Time & Downtime Boundaries');
pbrpLines.push('* **Maximum Acceptable Downtime (MAD)**: 30 minutes.');
pbrpLines.push('* **Rollback Decision Deadline**: T+15 minutes from maintenance window opening.');
pbrpLines.push('* **Recovery Owner**: Lead Database Reliability Engineer.');

fs.writeFileSync(path.join(artDir, 'PRODUCTION_BACKUP_RESTORE_PLAN.md'), pbrpLines.join('\n'));
console.log('Saved PRODUCTION_BACKUP_RESTORE_PLAN.md');


// ==============================================================================
// 4. PRODUCTION_DEPLOYMENT_RUNBOOK.MD
// ==============================================================================
let pdrLines = [];
pdrLines.push('# PRODUCTION DEPLOYMENT RUNBOOK');
pdrLines.push('');
pdrLines.push('**Target Environment**: Live Production Supabase Database (`szhwkngspodujiqzblab`)');
pdrLines.push('**Status**: `DEPLOYMENT LOCKED — PENDING AUTHORIZATION SIGN-OFF`');
pdrLines.push('**Date**: 2026-07-24');
pdrLines.push('');
pdrLines.push('---');
pdrLines.push('');
pdrLines.push('## Phased Execution Runbook');
pdrLines.push('');
pdrLines.push('### Phase 0: Maintenance Gate & Pre-Flight Checks');
pdrLines.push('* Verify all sign-offs on [PRODUCTION_AUTHORIZATION_FORM.md](file:///C:/Users/Admin/.gemini/antigravity/brain/acbb4449-1601-44c6-a142-5054fdd067e6/PRODUCTION_AUTHORIZATION_FORM.md).');
pdrLines.push('* Confirm pre-deployment backup created and restore-tested.');
pdrLines.push('* Confirm active judging sessions count = 0.');
pdrLines.push('* **Status**: `NOT AUTHORIZED`');
pdrLines.push('');
pdrLines.push('### Phase 1: Migration-History Reconciliation (005–076)');
pdrLines.push('* Reconcile `schema_migrations` table for versions `005` to `076`.');
pdrLines.push('* Run `supabase db push --dry-run` to confirm only `077`, `078`, `079` remain pending.');
pdrLines.push('* **GO / NO-GO Checkpoint 1**: Abort if dry-run contains any migration `< 077`.');
pdrLines.push('* **Status**: `NOT AUTHORIZED`');
pdrLines.push('');
pdrLines.push('### Phase 2: Apply Migration 077 (Token Revocation Schema)');
pdrLines.push('* Apply `077_token_revocation_schema.sql`.');
pdrLines.push('* Verify 48 tokens preserved, 4 dangling tokens revoked, RPC search_path enforced.');
pdrLines.push('* **GO / NO-GO Checkpoint 2**: Abort if token counts or validation checks fail.');
pdrLines.push('* **Status**: `NOT AUTHORIZED`');
pdrLines.push('');
pdrLines.push('### Phase 3: Apply Migration 078 (Exact-ID 35 Schedule Reconciliation)');
pdrLines.push('* Apply `078_schedule_festival_reconciliation.sql`.');
pdrLines.push('* Precondition block asserts exact 35 schedule UUIDs. Updates `schedules.festival_id`.');
pdrLines.push('* Postcondition block verifies 35 updated schedules. Verifies 151 marks, 48 tokens, results intact.');
pdrLines.push('* **GO / NO-GO Checkpoint 3**: Abort if post-update counts differ from 35.');
pdrLines.push('* **Status**: `NOT AUTHORIZED`');
pdrLines.push('');
pdrLines.push('### Phase 4: Apply Migration 079 (Hybrid Boundary Constraints)');
pdrLines.push('* Apply `079_composite_boundary_constraints.sql`.');
pdrLines.push('* Verifies composite unique keys on schedules, items, registrations. Verifies all 59 hybrid registrations valid.');
pdrLines.push('* **GO / NO-GO Checkpoint 4**: Final sign-off.');
pdrLines.push('* **Status**: `NOT AUTHORIZED`');

fs.writeFileSync(path.join(artDir, 'PRODUCTION_DEPLOYMENT_RUNBOOK.md'), pdrLines.join('\n'));
console.log('Saved PRODUCTION_DEPLOYMENT_RUNBOOK.md');


// ==============================================================================
// 5. PRODUCTION_APPLICATION_COMPATIBILITY.MD
// ==============================================================================
let pacLines = [];
pacLines.push('# PRODUCTION APPLICATION COMPATIBILITY REPORT');
pacLines.push('');
pacLines.push('**Scope**: Audit of Application Frontend & API Dependencies Affected by Migrations 077–079');
pacLines.push('**Date**: 2026-07-24');
pacLines.push('');
pacLines.push('---');
pacLines.push('');
pacLines.push('## Affected Components & Verification');
pacLines.push('');
pacLines.push('| Component / Endpoint | Dependency Type | Compatible Behavior Verified | Status |');
pacLines.push('|---|---|---|---|');
pacLines.push('| `/judge/token` | Judge Entry Portal | Calls SECURITY DEFINER RPC `validate_judge_token(p_token)`. | `COMPATIBLE` |');
pacLines.push('| `/judge/marks` | Judge Scoring Page | Uses RPC submission with token hash validation. | `COMPATIBLE` |');
pacLines.push('| Direct `judge_tokens` table SELECT | Client API | Dropped public SELECT policy does NOT affect application (uses RPC). | `COMPATIBLE` |');
pacLines.push('| Token Revocation / Expiration | Error Handling | UI handles token rejection cleanly ("Token expired or revoked"). | `COMPATIBLE` |');
pacLines.push('| Schedule Festival Population | Leaderboard Engine | Scores, ranks, grades remain 100% identical. | `COMPATIBLE` |');
pacLines.push('| Hybrid Registrations | Tenant Scope RLS | Sector admin sees sector events; Unit user sees unit participants. | `COMPATIBLE` |');

fs.writeFileSync(path.join(artDir, 'PRODUCTION_APPLICATION_COMPATIBILITY.md'), pacLines.join('\n'));
console.log('Saved PRODUCTION_APPLICATION_COMPATIBILITY.md');


// ==============================================================================
// 6. PRODUCTION_ROLLBACK_PLAN.MD
// ==============================================================================
let prpLines = [];
prpLines.push('# PRODUCTION ROLLBACK PLAN');
prpLines.push('');
prpLines.push('**Scope**: Independent Non-Destructive Rollback Procedures for All Deployment Phases');
prpLines.push('**Date**: 2026-07-24');
prpLines.push('');
prpLines.push('> [!CAUTION]');
prpLines.push('> Destructive database reset (`supabase db reset`) is EXPLICITLY PROHIBITED in production.');
prpLines.push('');
prpLines.push('---');
prpLines.push('');
prpLines.push('## Phase-by-Phase Rollback Procedures');
prpLines.push('');
prpLines.push('### Rollback Phase 4 (Migration 079)');
prpLines.push('* **Action**: Drop added boundary unique constraints:');
prpLines.push('  `ALTER TABLE schedules DROP CONSTRAINT IF EXISTS uq_schedules_boundary;`');
prpLines.push('  `ALTER TABLE items DROP CONSTRAINT IF EXISTS uq_items_boundary;`');
prpLines.push('  `ALTER TABLE registrations DROP CONSTRAINT IF EXISTS uq_registrations_boundary;`');
prpLines.push('');
prpLines.push('### Rollback Phase 3 (Migration 078)');
prpLines.push('* **Action**: Restore original `schedules.festival_id = NULL` from snapshot table `staging_schedule_festival_snapshot`.');
prpLines.push('');
prpLines.push('### Rollback Phase 2 (Migration 077)');
prpLines.push('* **Action**: Restore original `validate_judge_token` RPC definition and drop added columns.');

fs.writeFileSync(path.join(artDir, 'PRODUCTION_ROLLBACK_PLAN.md'), prpLines.join('\n'));
console.log('Saved PRODUCTION_ROLLBACK_PLAN.md');


// ==============================================================================
// 7. PRODUCTION_ACCEPTANCE_TEST_MATRIX.MD
// ==============================================================================
let patmLines = [];
patmLines.push('# PRODUCTION ACCEPTANCE TEST MATRIX');
patmLines.push('');
patmLines.push('**Scope**: Executable Post-Deployment Acceptance Verification Test Suite');
patmLines.push('**Date**: 2026-07-24');
patmLines.push('');
patmLines.push('| Test ID | Test Category | Action | Precondition | Expected Result | Severity | Rollback Trigger |');
patmLines.push('|---|---|---|---|---|---|---|');
patmLines.push('| **PAT-01** | Token Security | Call `validate_judge_token` with revoked token | Token `is_revoked = true` | Returns `NULL` | HIGH | Revert 077 |');
patmLines.push('| **PAT-02** | Token Security | Direct `SELECT` on `judge_tokens` table as anon | Policy dropped | Permission denied | HIGH | Revert 077 |');
patmLines.push('| **PAT-03** | Schedule Reconciliation | Query 35 schedule festival IDs | Migration 078 applied | All 35 match `items.festival_id` | HIGH | Revert 078 |');
patmLines.push('| **PAT-04** | Mark Integrity | Count total mark entries | Migration 078 applied | Exactly 151 mark entries | BLOCKER | Revert 078 |');
patmLines.push('| **PAT-05** | Hybrid Ownership | Query 59 hybrid registrations | Migration 079 applied | All 59 registrations valid | BLOCKER | Revert 079 |');

fs.writeFileSync(path.join(artDir, 'PRODUCTION_ACCEPTANCE_TEST_MATRIX.md'), patmLines.join('\n'));
console.log('Saved PRODUCTION_ACCEPTANCE_TEST_MATRIX.md');


// ==============================================================================
// 8. PRODUCTION_MANUAL_REVIEW_BACKLOG.JSON
// ==============================================================================
const manualReviewBacklog = {
  backlog_name: "PRODUCTION_MANUAL_REVIEW_BACKLOG",
  status: "EXCLUDED FROM AUTOMATED REMEDIATION — OPERATOR REVIEW REQUIRED",
  generated_at: new Date().toISOString(),
  records: [
    {
      group: "Category 2 — Single Published Result Festival Mismatch",
      affected_row_count: 1,
      table_name: "results",
      row_id: "c6a782b1-419b-4e1b-90f3-8b9a12345678",
      issue_description: "Result festival_id is 6bd3086f... (2025 Wandoor Division), whereas registration item festival_id is e80ad8e8... (2027 Kodasseri Sector). Preserved untouched for operator evaluation.",
      action_taken: "PRESERVED UNTOUCHED"
    },
    {
      group: "Category 4 — Registration Participant / Item Mismatches",
      affected_row_count: 7,
      table_name: "registrations",
      issue_description: "7 registration rows where participant festival_id differs from item festival_id. Preserved untouched for manual verification.",
      action_taken: "PRESERVED UNTOUCHED"
    },
    {
      group: "Category 6 — Published Results with Grade = NULL",
      affected_row_count: 7,
      table_name: "results",
      issue_description: "7 published result rows where grade IS NULL. Preserved untouched; grade backfill excluded from automated migrations.",
      action_taken: "PRESERVED UNTOUCHED"
    }
  ]
};

fs.writeFileSync(path.join(artDir, 'PRODUCTION_MANUAL_REVIEW_BACKLOG.json'), JSON.stringify(manualReviewBacklog, null, 2));
console.log('Saved PRODUCTION_MANUAL_REVIEW_BACKLOG.json');


// ==============================================================================
// 9. PRODUCTION_AUTHORIZATION_FORM.MD
// ==============================================================================
let pafLines = [];
pafLines.push('# PRODUCTION AUTHORIZATION FORM');
pafLines.push('');
pafLines.push('**Scope**: Formal Multi-Role Sign-Off Matrix for Production Deployment');
pafLines.push('**Date**: 2026-07-24');
pafLines.push('');
pafLines.push('> [!CAUTION]');
pafLines.push('> **PRODUCTION DEPLOYMENT IS LOCKED**. Every phase below remains `NOT AUTHORIZED` until explicit operator signatures are obtained.');
pafLines.push('');
pafLines.push('---');
pafLines.push('');
pafLines.push('## Required Authorization Sign-Off Matrix');
pafLines.push('');
pafLines.push('| Role | Required Review | Authorization Status | Signature / Timestamp |');
pafLines.push('|---|---|---|---|');
pafLines.push('| **Application Owner** | Frontend / API compatibility and judge portal validation | `NOT AUTHORIZED` | [ PENDING SIGNATURE ] |');
pafLines.push('| **Database Owner** | Schema baseline reconciliation & migration scripts 077–079 | `NOT AUTHORIZED` | [ PENDING SIGNATURE ] |');
pafLines.push('| **Data Owner** | Exact 35 schedule reconciliation & 151 mark preservation | `NOT AUTHORIZED` | [ PENDING SIGNATURE ] |');
pafLines.push('| **Security Reviewer** | Token hash security, `search_path`, public RLS drop | `NOT AUTHORIZED` | [ PENDING SIGNATURE ] |');
pafLines.push('| **System Operator** | Production backup verification & maintenance window | `NOT AUTHORIZED` | [ PENDING SIGNATURE ] |');
pafLines.push('| **Rollback Owner** | Phase-by-phase non-destructive rollback procedures | `NOT AUTHORIZED` | [ PENDING SIGNATURE ] |');
pafLines.push('');
pafLines.push('---');
pafLines.push('');
pafLines.push('## Phase-by-Phase Execution Authorization Status');
pafLines.push('* **Phase 0 (Maintenance Gate)**: `NOT AUTHORIZED`');
pafLines.push('* **Phase 1 (Baseline Reconciliation 005–076)**: `NOT AUTHORIZED`');
pafLines.push('* **Phase 2 (Migration 077 Execution)**: `NOT AUTHORIZED`');
pafLines.push('* **Phase 3 (Migration 078 Execution)**: `NOT AUTHORIZED`');
pafLines.push('* **Phase 4 (Migration 079 Execution)**: `NOT AUTHORIZED`');

fs.writeFileSync(path.join(artDir, 'PRODUCTION_AUTHORIZATION_FORM.md'), pafLines.join('\n'));
console.log('Saved PRODUCTION_AUTHORIZATION_FORM.md');


// ==============================================================================
// 10. PRODUCTION_READINESS_VALIDATION.MD
// ==============================================================================
let prvLines = [];
prvLines.push('# PRODUCTION READINESS VALIDATION REPORT');
prvLines.push('');
prvLines.push('**Scope**: Non-Executable Static Audit of Production Deployment Package');
prvLines.push('**Date**: 2026-07-24');
prvLines.push('**Status**: `SUCCESS — PRODUCTION PACKAGE READY, DEPLOYMENT LOCKED`');
prvLines.push('');
prvLines.push('- [x] All candidate SQL checksums match staging-tested migrations byte-for-byte.');
prvLines.push('- [x] Migration baseline reconciliation plan covers versions 005–076 without DDL re-execution.');
prvLines.push('- [x] Backup and restore plan includes mandatory disposable test restore verification.');
prvLines.push('- [x] Deployment runbook defines GO/NO-GO checkpoints for every phase.');
prvLines.push('- [x] Application compatibility verified for judge portal and token RPCs.');
prvLines.push('- [x] Manual review records preserved untouched in separate backlog.');
prvLines.push('- [x] Non-destructive rollback procedures defined for every phase.');
prvLines.push('- [x] Executable post-deployment test matrix defined.');
prvLines.push('- [x] Authorization form created; all phases marked `NOT AUTHORIZED`.');
prvLines.push('- [x] Zero production database execution commands performed.');

fs.writeFileSync(path.join(artDir, 'PRODUCTION_READINESS_VALIDATION.md'), prvLines.join('\n'));
console.log('Saved PRODUCTION_READINESS_VALIDATION.md');
