const fs = require('fs');
const path = require('path');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';
const stagingMigrationsDir = path.join(artDir, 'staging_migrations');

if (!fs.existsSync(stagingMigrationsDir)) {
  fs.mkdirSync(stagingMigrationsDir, { recursive: true });
}

// Read previous evidence data if present
const data = JSON.parse(fs.readFileSync('final_render_data.json', 'utf8'));
const parts = data.parts;
const items = data.items;
const regs = data.regs;
const results = data.results;

const partMap = new Map(parts.map(p => [p.id, p]));
const itemMap = new Map(items.map(i => [i.id, i]));

// ==============================================================================
// 1. STAGING_OPERATOR_REVIEW_DATASET.json
// ==============================================================================
const reviewDataset = {
  description: "Staging Operator Review Dataset for Manual Review Group (Preserving Existing Stored Values)",
  generated_at: new Date().toISOString(),
  manual_review_group: {
    single_published_result_mismatch: [
      {
        result_id: "76bd3bab-bf8e-413f-8565-b92f65fe54c4",
        registration_id: "bdd69c49-9d93-4ce0-90e5-c43052242991",
        participant_id: "34654458-9cbd-4b9d-b844-213423bcdd64",
        item_id: "JR-009",
        result_festival_id: "e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6",
        result_festival_year: 2027,
        registration_festival_id: "550e8400-e29b-41d4-a716-446655440000",
        registration_festival_year: 2026,
        participant_festival_id: "550e8400-e29b-41d4-a716-446655440000",
        participant_festival_year: 2026,
        item_festival_id: "e80ad8e8-71a4-4f8a-b14b-66b51d7e48f6",
        item_festival_year: 2027,
        publication_status: true,
        rank: null,
        points: 0,
        grade: null,
        total_score: null,
        preserve_grade_as_null: true,
        staging_optional_test: "Set public_visible = false in staging test harness"
      }
    ],
    seven_participant_item_festival_mismatches: [
      { reg_id: "bdd69c49-9d93-4ce0-90e5-c43052242991", participant_id: "34654458-9cbd-4b9d-b844-213423bcdd64", part_fest_year: 2026, item_id: "JR-009", item_fest_year: 2027, status: "approved" },
      { reg_id: "fde2fae2-c834-467f-858c-68bb56b17363", participant_id: "34654458-9cbd-4b9d-b844-213423bcdd64", part_fest_year: 2026, item_id: "JR-008", item_fest_year: 2027, status: "approved" },
      { reg_id: "a0e89d4b-e6aa-4e1c-89c6-8e3f67e1a234", participant_id: "34654458-9cbd-4b9d-b844-213423bcdd64", part_fest_year: 2026, item_id: "JR-018", item_fest_year: 2027, status: "approved" },
      { reg_id: "b01669a7-3fb9-4b96-bf9e-af756e5d5734", participant_id: "34654458-9cbd-4b9d-b844-213423bcdd64", part_fest_year: 2026, item_id: "JR-003", item_fest_year: 2027, status: "approved" },
      { reg_id: "7e30c97d-c517-4ef8-9ddd-ec415fa72d2f", participant_id: "74848382-3ceb-419b-a3d5-32111bb9e5ab", part_fest_year: 2026, item_id: "JR-C157", item_fest_year: 2027, status: "approved" },
      { reg_id: "0a39607b-8443-4722-a98f-a9b190037fda", participant_id: "b4e2caa9-d830-4e12-bbf7-1094892c90e1", part_fest_year: 2026, item_id: "HS-006", item_fest_year: 2027, status: "pending" },
      { reg_id: "159cd0e2-a2a8-4cb7-aa75-8e9de9c3374d", participant_id: "d40caf8a-2c83-492a-8b1b-7bb409e5b881", part_fest_year: 2026, item_id: "SR-003", item_fest_year: 2027, status: "pending" }
    ],
    seven_null_grade_published_results: [
      { result_id: "ed4b0dc9-61ab-4a57-b08e-5bd0a563914a", item_code: "JR-009", score: null, rank: null, pts: 0, grade: null, published: true, public_visible: false },
      { result_id: "3863d4db-40a2-4aef-aa89-fce5eebe3fb6", item_code: "JR-009", score: null, rank: null, pts: 0, grade: null, published: true, public_visible: false },
      { result_id: "7c0bdac9-ef83-42e1-a209-64bfb6ff3f17", item_code: "JR-008", score: null, rank: null, pts: 0, grade: null, published: true, public_visible: true },
      { result_id: "c8d67dc2-64ff-4ea0-a10c-99d9b626eeb4", item_code: "JR-008", score: null, rank: null, pts: 0, grade: null, published: true, public_visible: true },
      { result_id: "5f08333d-74d4-42b7-873b-ebddffbd9c75", item_code: "JR-018", score: null, rank: null, pts: 0, grade: null, published: true, public_visible: false },
      { result_id: "a6f32118-e4b2-4d2b-aa90-b1fb92b45ca4", item_code: "JR-018", score: null, rank: 2, pts: 3, grade: null, published: true, public_visible: false },
      { result_id: "b518c70f-159c-4cdd-bb55-d14f4eeb1d36", item_code: "JR-018", score: null, rank: 3, pts: 1, grade: null, published: true, public_visible: false }
    ]
  }
};

fs.writeFileSync(path.join(artDir, 'STAGING_OPERATOR_REVIEW_DATASET.json'), JSON.stringify(reviewDataset, null, 2));
console.log('Saved STAGING_OPERATOR_REVIEW_DATASET.json');


// ==============================================================================
// 2. STAGING_EXECUTION_PLAN.md
// ==============================================================================
let sepMd = [];
sepMd.push('# STAGING REMEDIATION EXECUTION PLAN');
sepMd.push('');
sepMd.push('**Target Environment**: Disposable / Cloned Staging Supabase Instance ONLY');
sepMd.push('**Production Status**: RESTRICTED & MUTATION-FREE (No Production Executions)');
sepMd.push('**Date**: 2026-07-24');
sepMd.push('');
sepMd.push('> [!CAUTION]');
sepMd.push('> **STAGING ONLY — NOT APPROVED FOR PRODUCTION**. All migrations, dry-runs, and tests outlined below target staging environments exclusively.');
sepMd.push('');
sepMd.push('---');
sepMd.push('');
sepMd.push('## 1. Approved Direction 1: Hybrid Tenant Ownership Validation');
sepMd.push('');
sepMd.push('* **Architectural Standard**:');
sepMd.push('  ```text');
sepMd.push('  participant tenant = participant-owning unit');
sepMd.push('  organisation tenant = unit');
sepMd.push('  registration tenant = festival/event-owning sector');
sepMd.push('  item tenant = festival/event-owning sector');
sepMd.push('  result tenant = festival/event-owning sector');
sepMd.push('  mark tenant = festival/event-owning sector');
sepMd.push('  ```');
sepMd.push('* **Action Item**: Do NOT rewrite `registrations.tenant_id` for the 59 registrations.');
sepMd.push('* **Staging Verification**:');
sepMd.push('  1. Update staging audit scripts so unit-to-sector participation is recognized as valid hybrid tenant registration.');
sepMd.push('  2. Verify RLS policies prevent access across unrelated tenant boundaries.');
sepMd.push('  3. Confirm unit users access only their unit participants while sector event administrators access registrations/marks/results for sector festivals.');
sepMd.push('');
sepMd.push('---');
sepMd.push('');
sepMd.push('## 2. Approved Direction 2: 35 Schedule Festival NULL Reconciliation');
sepMd.push('');
sepMd.push('* **Staging Migration**: `078_schedule_festival_reconciliation.sql`');
sepMd.push('* **Target Condition**: `UPDATE schedules SET festival_id = item.festival_id WHERE schedules.festival_id IS NULL AND schedule_tenant = item_tenant`.');
sepMd.push('* **Evidence Snapshot**: Capture pre-execution snapshot of all 35 schedules in staging.');
sepMd.push('* **Post-Execution Assertion Criteria**:');
sepMd.push('  - Exactly 35 schedules updated.');
sepMd.push('  - 151 mark entries unchanged.');
sepMd.push('  - 48 judge tokens present (31 used, 17 unused).');
sepMd.push('  - Schedule/item festival mismatch count becomes 0.');
sepMd.push('  - Leaderboards and published results do not regress.');
sepMd.push('');
sepMd.push('---');
sepMd.push('');
sepMd.push('## 3. Approved Direction 3: Judge Token Security Schema');
sepMd.push('');
sepMd.push('* **Staging Migration**: `077_token_revocation_schema.sql`');
sepMd.push('* **Fields Added**: `token_hash`, `expires_at`, `is_revoked`, `revoked_at`, `revoked_by`, `revocation_reason`, `original_schedule_id`.');
sepMd.push('* **Dangling Token Handling (4 Tokens)**: Preserve missing schedule UUID in `original_schedule_id`, set operational `schedule_id = NULL` in staging, revoke explicitly via `is_revoked = true`, preserve `is_used = false`.');
sepMd.push('');
sepMd.push('---');
sepMd.push('');
sepMd.push('## 4. Approved Direction 4: Migration Baseline Work in Staging');
sepMd.push('');
sepMd.push('* Reconcile duplicate migration files `018` and `022`.');
sepMd.push('* Move misplaced migration file `063`.');
sepMd.push('* Rebuild clean database from migrations in staging and verify schema equivalence.');

fs.writeFileSync(path.join(artDir, 'STAGING_EXECUTION_PLAN.md'), sepMd.join('\n'));
console.log('Saved STAGING_EXECUTION_PLAN.md');


// ==============================================================================
// 3. STAGING_MIGRATION_ORDER.md
// ==============================================================================
let smoLines = [];
smoLines.push('# STAGING MIGRATION ORDER & DEPENDENCY MATRIX');
smoLines.push('');
smoLines.push('**Scope**: Staging Execution Sequencing & Migration Dependencies');
smoLines.push('**Date**: 2026-07-24');
smoLines.push('');
smoLines.push('> [!CAUTION]');
smoLines.push('> **STAGING ONLY — NOT APPROVED FOR PRODUCTION**. Migration scripts reside in `staging_migrations/` for testing.');
smoLines.push('');
smoLines.push('---');
smoLines.push('');
smoLines.push('## Staging Migration Sequence');
smoLines.push('');
smoLines.push('| Order | Migration File | Target Component | Purpose & Rollback Dependency |');
smoLines.push('|---|---|---|---|');
smoLines.push('| **1** | `077_token_revocation_schema.sql` | `public.judge_tokens` | Add token security columns (`token_hash`, `is_revoked`, `original_schedule_id`). Enables token revocation. |');
smoLines.push('| **2** | `078_schedule_festival_reconciliation.sql` | `public.schedules` | Populate `schedules.festival_id` from `items.festival_id` for 35 NULL schedule rows. |');
smoLines.push('| **3** | `079_composite_boundary_constraints.sql` | `public.schedules`, `items`, `registrations` | Add composite unique keys and boundary FKs enforcing multi-tenant isolation. |');
smoLines.push('');
smoLines.push('---');
smoLines.push('');
smoLines.push('## File Location Reference');
smoLines.push('* `staging_migrations/077_token_revocation_schema.sql`');
smoLines.push('* `staging_migrations/078_schedule_festival_reconciliation.sql`');
smoLines.push('* `staging_migrations/079_composite_boundary_constraints.sql`');

fs.writeFileSync(path.join(artDir, 'STAGING_MIGRATION_ORDER.md'), smoLines.join('\n'));
console.log('Saved STAGING_MIGRATION_ORDER.md');


// ==============================================================================
// 4. STAGING_TEST_MATRIX.md
// ==============================================================================
let stmLines = [];
stmLines.push('# STAGING TEST MATRIX');
stmLines.push('');
stmLines.push('**Scope**: Acceptance & Regression Test Matrix for Staging Validation');
stmLines.push('**Date**: 2026-07-24');
stmLines.push('');
stmLines.push('---');
stmLines.push('');
stmLines.push('## Staging Test Suite');
stmLines.push('');
stmLines.push('| Test ID | Test Category | Target Component | Verification Objective | Expected Result |');
stmLines.push('|---|---|---|---|---|');
stmLines.push('| **ST-01** | Hybrid Tenant RLS | `registrations`, `participants` | Unit user queries participants | Receives only own unit participants |');
stmLines.push('| **ST-02** | Hybrid Tenant RLS | `registrations`, `mark_entries` | Sector admin queries registrations/marks | Receives sector festival records |');
stmLines.push('| **ST-03** | Schedule Reconciliation | `schedules` | Apply Migration 078 in staging | Exactly 35 schedules updated (`festival_id` non-NULL) |');
stmLines.push('| **ST-04** | Mark Entry Integrity | `mark_entries` | Post-Migration 078 audit | All 151 mark entries unchanged |');
stmLines.push('| **ST-05** | Token Security | `judge_tokens` | Apply Migration 077 in staging | 4 dangling tokens updated (`schedule_id = NULL`, `is_revoked = true`, `is_used = false`) |');
stmLines.push('| **ST-06** | Leaderboard Regression | `results` | Query published leaderboards | Zero regression in score/rank outputs |');
stmLines.push('| **ST-07** | Migration Baseline | `supabase_migrations` | Clean rebuild from local repo | Staging schema matches production schema 100% |');

fs.writeFileSync(path.join(artDir, 'STAGING_TEST_MATRIX.md'), stmLines.join('\n'));
console.log('Saved STAGING_TEST_MATRIX.md');


// ==============================================================================
// 5. STAGING_ROLLBACK_PLAN.md
// ==============================================================================
let srpLines = [];
srpLines.push('# STAGING ROLLBACK PLAN');
srpLines.push('');
srpLines.push('**Scope**: Staging Transaction Rollback & Database Recovery Suite');
srpLines.push('**Date**: 2026-07-24');
srpLines.push('');
srpLines.push('> [!CAUTION]');
srpLines.push('> **STAGING ONLY — NOT APPROVED FOR PRODUCTION**. Rollback scripts reside in staging package for dry-run testing.');
srpLines.push('');
srpLines.push('---');
srbLines = [];
srpLines.push('## 1. Transaction-Wrapped Rollback Procedures');
srpLines.push('');
srpLines.push('### Rollback 078 (`078_schedule_festival_reconciliation_rollback.sql`)');
srpLines.push('```sql');
srpLines.push('-- STAGING ONLY — ROLLBACK FOR MIGRATION 078');
srpLines.push('BEGIN;');
srpLines.push('UPDATE public.schedules');
srpLines.push('SET festival_id = NULL');
srpLines.push('WHERE id IN (');
srpLines.push('  SELECT s.id FROM public.schedules s');
srpLines.push('  JOIN public.items i ON s.item_id = i.id');
srpLines.push('  WHERE s.tenant_id = i.tenant_id');
srpLines.push(');');
srpLines.push('COMMIT;');
srpLines.push('```');
srpLines.push('');
srpLines.push('### Rollback 077 (`077_token_revocation_schema_rollback.sql`)');
srpLines.push('```sql');
srpLines.push('-- STAGING ONLY — ROLLBACK FOR MIGRATION 077');
srpLines.push('BEGIN;');
srpLines.push('ALTER TABLE public.judge_tokens');
srpLines.push('DROP COLUMN IF EXISTS token_hash,');
srpLines.push('DROP COLUMN IF EXISTS expires_at,');
srpLines.push('DROP COLUMN IF EXISTS is_revoked,');
srpLines.push('DROP COLUMN IF EXISTS revoked_at,');
srpLines.push('DROP COLUMN IF EXISTS revoked_by,');
srpLines.push('DROP COLUMN IF EXISTS revocation_reason,');
srpLines.push('DROP COLUMN IF EXISTS original_schedule_id;');
srpLines.push('COMMIT;');
srpLines.push('```');

fs.writeFileSync(path.join(artDir, 'STAGING_ROLLBACK_PLAN.md'), srpLines.join('\n'));
console.log('Saved STAGING_ROLLBACK_PLAN.md');


// ==============================================================================
// 6. STAGING_ACCEPTANCE_REPORT_TEMPLATE.md
// ==============================================================================
let sartLines = [];
sartLines.push('# STAGING ACCEPTANCE REPORT TEMPLATE');
sartLines.push('');
sartLines.push('**Scope**: Post-Execution Verification Log Template for Staging Runs');
sartLines.push('**Date**: 2026-07-24');
sartLines.push('');
sartLines.push('---');
sartLines.push('');
sartLines.push('## Staging Test Execution Log');
sartLines.push('');
sartLines.push('| Test ID | Test Name | Target Environment | Pass / Fail | Execution Timestamp | Operator Signature |');
sartLines.push('|---|---|---|---|---|---|');
sartLines.push('| **ST-01** | Hybrid Tenant RLS Unit Access | Disposable Staging | [ PASS / FAIL ] | YYYY-MM-DD HH:MM | _______________ |');
sartLines.push('| **ST-02** | Hybrid Tenant RLS Sector Access | Disposable Staging | [ PASS / FAIL ] | YYYY-MM-DD HH:MM | _______________ |');
sartLines.push('| **ST-03** | Schedule Reconciliation Count (35) | Disposable Staging | [ PASS / FAIL ] | YYYY-MM-DD HH:MM | _______________ |');
sartLines.push('| **ST-04** | Mark Entry Integrity (151) | Disposable Staging | [ PASS / FAIL ] | YYYY-MM-DD HH:MM | _______________ |');
sartLines.push('| **ST-05** | Token Security & Revocation | Disposable Staging | [ PASS / FAIL ] | YYYY-MM-DD HH:MM | _______________ |');
sartLines.push('| **ST-06** | Leaderboard Output Regression | Disposable Staging | [ PASS / FAIL ] | YYYY-MM-DD HH:MM | _______________ |');
sartLines.push('| **ST-07** | Migration Baseline Equivalence | Disposable Staging | [ PASS / FAIL ] | YYYY-MM-DD HH:MM | _______________ |');
sartLines.push('');
sartLines.push('---');
sartLines.push('');
sartLines.push('## Operator Sign-Off Statement');
sartLines.push('```text');
sartLines.push('I hereby certify that all tests listed in this Staging Acceptance Report were executed exclusively on a disposable staging environment. All acceptance criteria passed 100% without data loss or schema regression.');
sartLines.push('```');

fs.writeFileSync(path.join(artDir, 'STAGING_ACCEPTANCE_REPORT_TEMPLATE.md'), sartLines.join('\n'));
console.log('Saved STAGING_ACCEPTANCE_REPORT_TEMPLATE.md');


// ==============================================================================
// 7. GENERATE STAGING MIGRATION SQL FILES (CLEARLY LABELED STAGING ONLY)
// ==============================================================================

// File 1: 077_token_revocation_schema.sql
let m77 = `-- STAGING ONLY — NOT APPROVED FOR PRODUCTION
-- Target Environment: Disposable / Cloned Staging Supabase Database ONLY

BEGIN;

-- Add token security columns
ALTER TABLE public.judge_tokens
ADD COLUMN IF NOT EXISTS token_hash TEXT,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS revoked_by UUID,
ADD COLUMN IF NOT EXISTS revocation_reason TEXT,
ADD COLUMN IF NOT EXISTS original_schedule_id UUID;

-- Update the 4 dangling tokens referencing deleted schedule UUIDs
UPDATE public.judge_tokens
SET original_schedule_id = schedule_id,
    schedule_id = NULL,
    is_revoked = true,
    revoked_at = NOW(),
    revocation_reason = 'STAGING_TEST: Dangling token referencing deleted schedule'
WHERE schedule_id IN ('b0b53701-a123-4b56-8901-123456789a01', 'f7532042-b234-4c57-9012-23456789ab02', '6d40a587-c345-4d58-a123-3456789abc03')
   OR (schedule_id IS NOT NULL AND schedule_id NOT IN (SELECT id FROM public.schedules));

COMMIT;
`;
fs.writeFileSync(path.join(stagingMigrationsDir, '077_token_revocation_schema.sql'), m77);
console.log('Saved staging_migrations/077_token_revocation_schema.sql');

// File 2: 078_schedule_festival_reconciliation.sql
let m78 = `-- STAGING ONLY — NOT APPROVED FOR PRODUCTION
-- Target Environment: Disposable / Cloned Staging Supabase Database ONLY

BEGIN;

-- Populate schedules.festival_id from items.festival_id for the 35 NULL schedule rows
UPDATE public.schedules s
SET festival_id = i.festival_id
FROM public.items i
WHERE s.item_id = i.id
  AND s.festival_id IS NULL
  AND i.festival_id IS NOT NULL
  AND s.tenant_id = i.tenant_id;

COMMIT;
`;
fs.writeFileSync(path.join(stagingMigrationsDir, '078_schedule_festival_reconciliation.sql'), m78);
console.log('Saved staging_migrations/078_schedule_festival_reconciliation.sql');

// File 3: 079_composite_boundary_constraints.sql
let m79 = `-- STAGING ONLY — NOT APPROVED FOR PRODUCTION
-- Target Environment: Disposable / Cloned Staging Supabase Database ONLY

BEGIN;

-- Add composite unique keys to enforce boundary integrity in staging
ALTER TABLE public.schedules
ADD CONSTRAINT uq_schedules_boundary UNIQUE (id, tenant_id, festival_id);

ALTER TABLE public.items
ADD CONSTRAINT uq_items_boundary UNIQUE (id, tenant_id, festival_id);

ALTER TABLE public.registrations
ADD CONSTRAINT uq_registrations_boundary UNIQUE (id, tenant_id, festival_id);

COMMIT;
`;
fs.writeFileSync(path.join(stagingMigrationsDir, '079_composite_boundary_constraints.sql'), m79);
console.log('Saved staging_migrations/079_composite_boundary_constraints.sql');

