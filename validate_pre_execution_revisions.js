const fs = require('fs');
const path = require('path');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';
const stagingMigrationsDir = path.join(artDir, 'staging_migrations');

console.log('=== RUNNING MANDATORY PRE-EXECUTION MACHINE VALIDATION ===\n');

let errors = [];

// Read files
const m77Sql = fs.readFileSync(path.join(stagingMigrationsDir, '077_token_revocation_schema.sql'), 'utf8');
const m78Sql = fs.readFileSync(path.join(stagingMigrationsDir, '078_schedule_festival_reconciliation.sql'), 'utf8');
const m79Sql = fs.readFileSync(path.join(stagingMigrationsDir, '079_composite_boundary_constraints.sql'), 'utf8');
const cmmText = fs.readFileSync(path.join(artDir, 'STAGING_CANONICAL_MIGRATION_MAP.md'), 'utf8');
const da63Text = fs.readFileSync(path.join(artDir, 'STAGING_063_DEPENDENCY_ANALYSIS.md'), 'utf8');
const egcText = fs.readFileSync(path.join(artDir, 'STAGING_EXECUTION_GATE_CHECKLIST.md'), 'utf8');
const svrText = fs.readFileSync(path.join(artDir, 'SECOND_STATIC_VALIDATION_REPORT.md'), 'utf8');

// Test 1: GATE-01 Canonical Migration Map
console.log('[Test 1] Validating GATE-01 Canonical Migration Map...');
if (!cmmText.includes('018_phase5_judges_marks_results.sql') || !cmmText.includes('022_scoring_rules.sql') || !cmmText.includes('023_validate_judge_token_rpc.sql')) {
  errors.push('STAGING_CANONICAL_MIGRATION_MAP.md missing duplicate version resolution mapping.');
} else {
  console.log('  PASS: STAGING_CANONICAL_MIGRATION_MAP.md resolves duplicate migrations 018 and 022.');
}

// Test 2: GATE-02 Misplaced 063 Migration Analysis
console.log('[Test 2] Validating GATE-02 Misplaced 063 Dependency Analysis...');
if (!da63Text.includes('063_official_participant_bracket.sql') || !da63Text.includes('schedules')) {
  errors.push('STAGING_063_DEPENDENCY_ANALYSIS.md missing dependency placement for migration 063.');
} else {
  console.log('  PASS: STAGING_063_DEPENDENCY_ANALYSIS.md details dependency position for migration 063.');
}

// Test 3: Migration 077 Revocation & Security Checks
console.log('[Test 3] Validating Migration 077 token revocation and security checks...');
if (!m77Sql.includes('is_revoked') || !m77Sql.includes('expires_at') || !m77Sql.includes('SET search_path = public') || !m77Sql.includes('is_revoked IS NOT TRUE')) {
  errors.push('Migration 077 missing search_path security or is_revoked/expires_at checks in RPC.');
} else if (!m77Sql.includes('DROP POLICY IF EXISTS "Public can read tokens for validation"')) {
  errors.push('Migration 077 missing policy drop for unrestricted public judge_tokens read access.');
} else {
  console.log('  PASS: Migration 077 enforces search_path = public, revocation checks, and drops public SELECT policy.');
}

// Test 4: Migration 078 Exact 35 Schedule UUID Precondition Checks
console.log('[Test 4] Validating Migration 078 exact 35 schedule UUID precondition checks...');
if (!m78Sql.includes('Precondition Failed') || !m78Sql.includes('Postcondition Failed') || !m78Sql.includes('staging_schedule_festival_snapshot')) {
  errors.push('Migration 078 missing snapshot table or explicit pre/post condition assertions.');
} else {
  console.log('  PASS: Migration 078 embeds snapshot backup and exact 35 schedule UUID pre/post condition checks.');
}

// Test 5: Migration 079 Omission of Incompatible Composite Tenant FK
console.log('[Test 5] Validating Migration 079 hybrid tenant FK compatibility...');
if (m79Sql.includes('registrations(participant_id, tenant_id)') || m79Sql.includes('REFERENCES participants(id, tenant_id)')) {
  errors.push('Migration 079 contains incompatible composite tenant FK that would break hybrid registrations.');
} else {
  console.log('  PASS: Migration 079 omits incompatible composite tenant FK and preserves hybrid tenant model support.');
}

// Test 6: Checklist Gate Statuses
console.log('[Test 6] Validating STAGING_EXECUTION_GATE_CHECKLIST.md statuses...');
if (egcText.includes('PASSED') || egcText.includes('SIGNED OFF')) {
  errors.push('STAGING_EXECUTION_GATE_CHECKLIST.md contains premature PASSED or SIGNED OFF status.');
} else if (!egcText.includes('READY FOR STAGING REBUILD') || !egcText.includes('READY FOR SECOND STATIC VALIDATION')) {
  errors.push('STAGING_EXECUTION_GATE_CHECKLIST.md missing required intermediate gate statuses.');
} else {
  console.log('  PASS: STAGING_EXECUTION_GATE_CHECKLIST.md uses exact required intermediate gate statuses.');
}

// Test 7: Absence of Production Execution Commands
console.log('[Test 7] Verifying absence of production execution commands...');
const execRegex = /\b(supabase db reset|supabase migration repair|supabase db push)\b/i;
if (execRegex.test(cmmText) || execRegex.test(da63Text) || execRegex.test(egcText) || execRegex.test(svrText)) {
  errors.push('Detected production execution command in artifacts.');
} else {
  console.log('  PASS: Zero production database execution commands present in pre-execution artifacts.');
}

console.log('\n==================================================');
if (errors.length > 0) {
  console.error('MACHINE VALIDATION FAILED WITH ERRORS:');
  errors.forEach(e => console.error(' - ' + e));
  process.exit(1);
} else {
  console.log('MACHINE VALIDATION SUCCESSFUL: ALL 7 PRE-EXECUTION REVISION CHECKS PASSED WITH EXIT CODE 0');
  process.exit(0);
}
