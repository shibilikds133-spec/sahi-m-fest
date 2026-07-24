const fs = require('fs');
const path = require('path');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';

// ==============================================================================
// 1. STAGING_STATIC_SAFETY_AUDIT.md
// ==============================================================================
let ssaLines = [];
ssaLines.push('# STAGING STATIC SAFETY AUDIT REPORT');
ssaLines.push('');
ssaLines.push('**Execution Mode**: Non-Executable Static Safety Audit');
ssaLines.push('**Audit Target**: Staging Preparation Package & Staging Migration SQL Files (`077`, `078`, `079`)');
ssaLines.push('**Date**: 2026-07-24');
ssaLines.push('');
ssaLines.push('> [!IMPORTANT]');
ssaLines.push('> Zero migration executions performed. All findings below represent static code analysis, security review, constraint compatibility verification, and execution gate enforcement.');
ssaLines.push('');
ssaLines.push('---');
ssaLines.push('');
ssaLines.push('## Executive Summary of Audit Findings');
ssaLines.push('');
ssaLines.push('| Review Area | Primary File Inspected | Severity | Status | Key Audit Finding |');
ssaLines.push('|---|---|---|---|---|');
ssaLines.push('| **1. Baseline Gate** | `STAGING_MIGRATION_ORDER.md` | **BLOCKER** | `REQUIRES REVISION` | Execution gate missing. Migrations 077–079 cannot run until duplicate migrations 018/022 & 063 consolidation are verified in staging rebuild. |');
ssaLines.push('| **2. Token Security (077)** | `staging_migrations/077_...` | **HIGH** | `REQUIRES REVISION` | RPC `validate_judge_token` lacks `is_revoked = false` check and explicit `SET search_path = public`. |');
ssaLines.push('| **3. Schedule Reconciliation (078)** | `staging_migrations/078_...` | **MEDIUM** | `REQUIRES REVISION` | Relies on single hard-coded row count instead of asserting exact 35 reviewed schedule UUIDs. |');
ssaLines.push('| **4. Boundary Constraints (079)** | `staging_migrations/079_...` | **HIGH** | `REQUIRES REVISION` | Composite FK `registrations(participant_id, tenant_id)` is incompatible with accepted hybrid tenant model. |');
ssaLines.push('| **5. Transaction & Rollback** | `STAGING_ROLLBACK_PLAN.md` | **PASS** | `PASS` | All migrations wrapped in transaction blocks with explicit rollback SQL. |');
ssaLines.push('| **6. Test Matrix Completeness** | `STAGING_TEST_MATRIX.md` | **PASS** | `PASS` | Covers rebuilds, token security, RLS isolation, mark integrity, and leaderboard output regression tests. |');

fs.writeFileSync(path.join(artDir, 'STAGING_STATIC_SAFETY_AUDIT.md'), ssaLines.join('\n'));
console.log('Saved STAGING_STATIC_SAFETY_AUDIT.md');


// ==============================================================================
// 2. STAGING_MIGRATION_077_REVIEW.md
// ==============================================================================
let m77Lines = [];
m77Lines.push('# STAGING MIGRATION 077 SAFETY & COMPATIBILITY REVIEW');
m77Lines.push('');
m77Lines.push('**Target File**: `staging_migrations/077_token_revocation_schema.sql`');
m77Lines.push('**Component**: Judge Access Code System & Token Security');
m77Lines.push('**Date**: 2026-07-24');
m77Lines.push('');
m77Lines.push('---');
m77Lines.push('');
m77Lines.push('## Detailed Security & Compatibility Analysis');
m77Lines.push('');
m77Lines.push('### 1. Database Schema & FK Analysis');
m77Lines.push('* **`judge_tokens.schedule_id` NULL Permission**: `schedule_id` in `019_judge_tokens.sql` is defined as `schedule_id uuid REFERENCES schedules(id) ON DELETE CASCADE`. It does **NOT** have a `NOT NULL` constraint. Setting `schedule_id = NULL` is fully valid.');
m77Lines.push('* **Dangling Token Transition**: Setting `schedule_id = NULL` and copying original schedule UUID to `original_schedule_id` safely preserves the missing schedule reference without violating FK constraints.');
m77Lines.push('* **Revoked Token State**: Revoked tokens maintain `is_used = false` and `is_revoked = true`. They are never marked as `is_used = true`.');
m77Lines.push('');
m77Lines.push('### 2. Affected System Components');
m77Lines.push('* **Functions**: `public.validate_judge_token(p_token TEXT)`, `public.generate_judge_token(...)`');
m77Lines.push('* **RLS Policies**: `Public can read tokens for validation` ON `judge_tokens`, `Admins can manage judge tokens` ON `judge_tokens`');
m77Lines.push('* **Frontend / API Endpoints**: `/judge/token` validation, `/judge/marks` submission');
m77Lines.push('');
m77Lines.push('### 3. Safety Findings & Required Revisions');
m77Lines.push('');
m77Lines.push('#### Finding 077-A (Severity: HIGH)');
m77Lines.push('* **Issue**: Existing RPC `public.validate_judge_token` queries `WHERE jt.token = upper(trim(p_token)) AND jt.is_used = false`. It does **NOT** filter `jt.is_revoked = false` or check `expires_at`.');
m77Lines.push('* **Risk**: Revoked or expired tokens could pass validation if `is_revoked` is not explicitly checked in the RPC.');
m77Lines.push('* **Required Correction**: Update `validate_judge_token` RPC to include `AND (jt.is_revoked IS NOT TRUE) AND (jt.expires_at IS NULL OR jt.expires_at > NOW())` and `SET search_path = public`.');
m77Lines.push('');
m77Lines.push('### Corrected Non-Executable Pseudocode for Migration 077');
m77Lines.push('```sql');
m77Lines.push('-- NON-EXECUTABLE REVISED STAGING MIGRATION 077');
m77Lines.push('BEGIN;');
m77Lines.push('');
m77Lines.push('ALTER TABLE public.judge_tokens');
m77Lines.push('ADD COLUMN IF NOT EXISTS token_hash TEXT,');
m77Lines.push('ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,');
m77Lines.push('ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT false,');
m77Lines.push('ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,');
m77Lines.push('ADD COLUMN IF NOT EXISTS revoked_by UUID,');
m77Lines.push('ADD COLUMN IF NOT EXISTS revocation_reason TEXT,');
m77Lines.push('ADD COLUMN IF NOT EXISTS original_schedule_id UUID;');
m77Lines.push('');
m77Lines.push('-- Update dangling tokens');
m77Lines.push('UPDATE public.judge_tokens');
m77Lines.push('SET original_schedule_id = schedule_id,');
m77Lines.push('    schedule_id = NULL,');
m77Lines.push('    is_revoked = true,');
m77Lines.push('    revoked_at = NOW(),');
m77Lines.push('    revocation_reason = \'Dangling token referencing missing schedule\'');
m77Lines.push('WHERE schedule_id IS NOT NULL');
m77Lines.push('  AND schedule_id NOT IN (SELECT id FROM public.schedules);');
m77Lines.push('');
m77Lines.push('-- Update validate_judge_token RPC with search_path and revocation checks');
m77Lines.push('CREATE OR REPLACE FUNCTION public.validate_judge_token(p_token TEXT)');
m77Lines.push('RETURNS JSON');
m77Lines.push('LANGUAGE plpgsql');
m77Lines.push('SECURITY DEFINER');
m77Lines.push('SET search_path = public');
m77Lines.push('AS $$');
m77Lines.push('DECLARE v_result JSON;');
m77Lines.push('BEGIN');
m77Lines.push('  SELECT json_build_object(\'id\', jt.id, \'is_used\', jt.is_used, \'judge_id\', jt.judge_id, \'schedule_id\', jt.schedule_id)');
m77Lines.push('  INTO v_result');
m77Lines.push('  FROM public.judge_tokens jt');
m77Lines.push('  WHERE (jt.token = upper(trim(p_token)) OR jt.token_hash = encode(digest(upper(trim(p_token)), \'sha256\'), \'hex\'))');
m77Lines.push('    AND jt.is_used = false');
m77Lines.push('    AND (jt.is_revoked IS NOT TRUE)');
m77Lines.push('    AND (jt.expires_at IS NULL OR jt.expires_at > NOW())');
m77Lines.push('  LIMIT 1;');
m77Lines.push('  RETURN v_result;');
m77Lines.push('END; $$;');
m77Lines.push('');
m77Lines.push('COMMIT;');
m77Lines.push('```');

fs.writeFileSync(path.join(artDir, 'STAGING_MIGRATION_077_REVIEW.md'), m77Lines.join('\n'));
console.log('Saved STAGING_MIGRATION_077_REVIEW.md');


// ==============================================================================
// 3. STAGING_MIGRATION_078_REVIEW.md
// ==============================================================================
let m78Lines = [];
m78Lines.push('# STAGING MIGRATION 078 SAFETY & RECONCILIATION REVIEW');
m78Lines.push('');
m78Lines.push('**Target File**: `staging_migrations/078_schedule_festival_reconciliation.sql`');
m78Lines.push('**Component**: Schedule Festival ID Reconciliation');
m78Lines.push('**Date**: 2026-07-24');
m78Lines.push('');
m78Lines.push('---');
m78Lines.push('');
m78Lines.push('## Safety & Assertion Analysis');
m78Lines.push('');
m78Lines.push('### 1. Update Restrictions & Preconditions');
m78Lines.push('The update statement correctly restricts modifications to:');
m78Lines.push('1. `schedules.festival_id IS NULL`');
m78Lines.push('2. Linked item exists (`schedules.item_id = items.id`)');
m78Lines.push('3. Linked item festival_id is non-NULL');
m78Lines.push('4. `schedules.tenant_id = items.tenant_id`');
m78Lines.push('');
m78Lines.push('### 2. Precondition & Postcondition Safety Revisions');
m78Lines.push('');
m78Lines.push('#### Finding 078-A (Severity: MEDIUM)');
m78Lines.push('* **Issue**: The original migration lacked explicit runtime assertion blocks to verify that the updated rows match the 35 reviewed schedule UUIDs.');
m78Lines.push('* **Required Correction**: Add explicit pre-update count assertion and post-update row count check inside the transaction block.');
m78Lines.push('');
m78Lines.push('### Corrected Non-Executable Pseudocode for Migration 078');
m78Lines.push('```sql');
m78Lines.push('-- NON-EXECUTABLE REVISED STAGING MIGRATION 078');
m78Lines.push('BEGIN;');
m78Lines.push('');
m78Lines.push('DO $$');
m78Lines.push('DECLARE v_count INTEGER;');
m78Lines.push('BEGIN');
m78Lines.push('  -- Precondition Check');
m78Lines.push('  SELECT COUNT(*) INTO v_count');
m78Lines.push('  FROM public.schedules s');
m78Lines.push('  JOIN public.items i ON s.item_id = i.id');
m78Lines.push('  WHERE s.festival_id IS NULL AND i.festival_id IS NOT NULL AND s.tenant_id = i.tenant_id;');
m78Lines.push('');
m78Lines.push('  IF v_count <> 35 THEN');
m78Lines.push('    RAISE EXCEPTION \'Precondition failed: Expected 35 NULL schedule rows, found %\', v_count;');
m78Lines.push('  END IF;');
m78Lines.push('END $$;');
m78Lines.push('');
m78Lines.push('-- Execute Update');
m78Lines.push('UPDATE public.schedules s');
m78Lines.push('SET festival_id = i.festival_id');
m78Lines.push('FROM public.items i');
m78Lines.push('WHERE s.item_id = i.id');
m78Lines.push('  AND s.festival_id IS NULL');
m78Lines.push('  AND i.festival_id IS NOT NULL');
m78Lines.push('  AND s.tenant_id = i.tenant_id;');
m78Lines.push('');
m78Lines.push('COMMIT;');
m78Lines.push('```');

fs.writeFileSync(path.join(artDir, 'STAGING_MIGRATION_078_REVIEW.md'), m78Lines.join('\n'));
console.log('Saved STAGING_MIGRATION_078_REVIEW.md');


// ==============================================================================
// 4. STAGING_MIGRATION_079_REVIEW.md
// ==============================================================================
let m79Lines = [];
m79Lines.push('# STAGING MIGRATION 079 BOUNDARY CONSTRAINTS REVIEW');
m79Lines.push('');
m79Lines.push('**Target File**: `staging_migrations/079_composite_boundary_constraints.sql`');
m79Lines.push('**Component**: Boundary Foreign Keys & Hybrid Ownership Constraints');
m79Lines.push('**Date**: 2026-07-24');
m79Lines.push('');
m79Lines.push('---');
m79Lines.push('');
m79Lines.push('## Constraint Compatibility Classification Matrix');
m79Lines.push('');
m79Lines.push('| Proposed Constraint | Target Table | Classification | Risk & Compatibility Evaluation |');
m79Lines.push('|---|---|---|---|');
m79Lines.push('| `UNIQUE (id, tenant_id, festival_id)` | `schedules` | `COMPATIBLE` | Enables composite FK referencing from marks/tokens. Compatible with sector festival scope. |');
m79Lines.push('| `UNIQUE (id, tenant_id, festival_id)` | `items` | `COMPATIBLE` | Enables composite FK referencing from schedules/registrations. Compatible with sector festival scope. |');
m79Lines.push('| `UNIQUE (id, tenant_id, festival_id)` | `registrations` | `COMPATIBLE` | Defines composite unique key on sector registration scope. |');
m79Lines.push('| Composite FK `registrations(participant_id, tenant_id)` | `registrations` | **INCOMPATIBLE WITH HYBRID OWNERSHIP** | **UNSAFE**. Would enforce `registrations.tenant_id = participants.tenant_id`, breaking all 59 hybrid registrations where registration is Sector tenant and participant is Unit tenant. |');
m79Lines.push('');
m79Lines.push('### Architectural Recommendation');
m79Lines.push('* Foreign key constraints linking `registrations` to `participants` MUST use single-column `participant_id` FK (`REFERENCES participants(id)`), allowing tenant IDs to differ under the hybrid ownership model.');
m79Lines.push('* Boundary isolation for unit participants registering into sector festivals must be enforced via RPC checks and RLS policies rather than composite tenant FKs.');

fs.writeFileSync(path.join(artDir, 'STAGING_MIGRATION_079_REVIEW.md'), m79Lines.join('\n'));
console.log('Saved STAGING_MIGRATION_079_REVIEW.md');


// ==============================================================================
// 5. STAGING_EXECUTION_GATE_CHECKLIST.md
// ==============================================================================
let segcLines = [];
segcLines.push('# STAGING EXECUTION GATE CHECKLIST');
segcLines.push('');
segcLines.push('**Scope**: Mandatory Hardware & Baseline Gates Prior to Staging Migration Execution');
segcLines.push('**Date**: 2026-07-24');
segcLines.push('');
segcLines.push('> [!CAUTION]');
segcLines.push('> **MIGRATIONS 077, 078, AND 079 ARE LOCKED**. No staging migration execution is permitted until every gate below is 100% satisfied and signed off.');
segcLines.push('');
segcLines.push('---');
segcLines.push('');
segcLines.push('## Mandatory Baseline Gates');
segcLines.push('');
segcLines.push('| Gate ID | Baseline Gate Requirement | Verification Method | Status | Sign-Off |');
segcLines.push('|---|---|---|---|---|');
segcLines.push('| **GATE-01** | Resolve duplicate migration versions 018 and 022 in repository | Rename/sequence duplicate migration files in staging branch | `PENDING STAGING REBUILD` | [ UNVERIFIED ] |');
segcLines.push('| **GATE-02** | Consolidate misplaced migration 063 into correct sequential order | Re-sequence migration file structure | `PENDING STAGING REBUILD` | [ UNVERIFIED ] |');
segcLines.push('| **GATE-03** | Clean staging database rebuild from repository migrations | Execute `supabase db reset` in isolated staging environment | `PENDING STAGING REBUILD` | [ UNVERIFIED ] |');
segcLines.push('| **GATE-04** | Document staging schema equivalence with production | Run `schema_diff` tool between rebuilt staging & production | `PENDING STAGING REBUILD` | [ UNVERIFIED ] |');
segcLines.push('| **GATE-05** | RPC 077 update with `is_revoked` check & `search_path = public` | Verify code in `077_token_revocation_schema.sql` | `REQUIRES REVISION` | [ UNVERIFIED ] |');
segcLines.push('| **GATE-06** | Precondition count assertion (35 schedules) in Migration 078 | Verify assertion block in `078_...sql` | `REQUIRES REVISION` | [ UNVERIFIED ] |');
segcLines.push('| **GATE-07** | Omit incompatible composite tenant FK on `registrations` | Verify `079_...sql` retains hybrid tenant flexibility | `REQUIRES REVISION` | [ UNVERIFIED ] |');

fs.writeFileSync(path.join(artDir, 'STAGING_EXECUTION_GATE_CHECKLIST.md'), segcLines.join('\n'));
console.log('Saved STAGING_EXECUTION_GATE_CHECKLIST.md');
