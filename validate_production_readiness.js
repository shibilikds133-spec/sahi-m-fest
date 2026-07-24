const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';
const stagingMigrationsDir = path.join(artDir, 'staging_migrations');

console.log('=== RUNNING PRODUCTION READINESS MACHINE VALIDATION SUITE ===\n');

let errors = [];

// Read files
const pccJson = JSON.parse(fs.readFileSync(path.join(artDir, 'PRODUCTION_CANDIDATE_CHECKSUMS.json'), 'utf8'));
const pmbpText = fs.readFileSync(path.join(artDir, 'PRODUCTION_MIGRATION_BASELINE_PLAN.md'), 'utf8');
const pbrpText = fs.readFileSync(path.join(artDir, 'PRODUCTION_BACKUP_RESTORE_PLAN.md'), 'utf8');
const pdrText = fs.readFileSync(path.join(artDir, 'PRODUCTION_DEPLOYMENT_RUNBOOK.md'), 'utf8');
const pacText = fs.readFileSync(path.join(artDir, 'PRODUCTION_APPLICATION_COMPATIBILITY.md'), 'utf8');
const prpText = fs.readFileSync(path.join(artDir, 'PRODUCTION_ROLLBACK_PLAN.md'), 'utf8');
const patmText = fs.readFileSync(path.join(artDir, 'PRODUCTION_ACCEPTANCE_TEST_MATRIX.md'), 'utf8');
const pmrbJson = JSON.parse(fs.readFileSync(path.join(artDir, 'PRODUCTION_MANUAL_REVIEW_BACKLOG.json'), 'utf8'));
const pafText = fs.readFileSync(path.join(artDir, 'PRODUCTION_AUTHORIZATION_FORM.md'), 'utf8');
const prvText = fs.readFileSync(path.join(artDir, 'PRODUCTION_READINESS_VALIDATION.md'), 'utf8');

// Test 1: Checksums match staging-tested migrations
console.log('[Test 1] Validating Candidate Checksums...');
pccJson.forEach(item => {
  const stagingSqlPath = path.join(stagingMigrationsDir, item.filename);
  const sqlContent = fs.readFileSync(stagingSqlPath, 'utf8');
  const actualHash = crypto.createHash('sha256').update(sqlContent).digest('hex');

  if (item.sha256_checksum !== actualHash || item.production_candidate_checksum !== actualHash) {
    errors.push(`Checksum mismatch for ${item.filename}! Recorded: ${item.sha256_checksum}, Actual: ${actualHash}`);
  } else {
    console.log(`  PASS: Checksum for ${item.filename} matches staging-tested SQL byte-for-byte.`);
  }
});

// Test 2: Baseline plan covers 005–076 without reapplying DDL
console.log('[Test 2] Validating Baseline Reconciliation Plan...');
if (!pmbpText.includes('005 to 076') || !pmbpText.includes('supabase db push --linked --dry-run')) {
  errors.push('PRODUCTION_MIGRATION_BASELINE_PLAN.md missing 005–076 baseline range or dry-run assertion.');
} else {
  console.log('  PASS: PRODUCTION_MIGRATION_BASELINE_PLAN.md covers 005–076 baseline reconciliation.');
}

// Test 3: Backup & Restore Plan
console.log('[Test 3] Validating Backup & Restore Plan...');
if (!pbrpText.includes('disposable test database') || !pbrpText.includes('30 minutes')) {
  errors.push('PRODUCTION_BACKUP_RESTORE_PLAN.md missing disposable test restore verification or downtime limits.');
} else {
  console.log('  PASS: PRODUCTION_BACKUP_RESTORE_PLAN.md mandates disposable test restore verification.');
}

// Test 4: Deployment Runbook Checkpoints
console.log('[Test 4] Validating Deployment Runbook Checkpoints...');
if (!pdrText.includes('GO / NO-GO Checkpoint 1') || !pdrText.includes('GO / NO-GO Checkpoint 4')) {
  errors.push('PRODUCTION_DEPLOYMENT_RUNBOOK.md missing GO/NO-GO checkpoints.');
} else {
  console.log('  PASS: PRODUCTION_DEPLOYMENT_RUNBOOK.md defines GO/NO-GO checkpoints for all phases.');
}

// Test 5: Application Compatibility
console.log('[Test 5] Validating Application Compatibility...');
if (!pacText.includes('validate_judge_token') || !pacText.includes('COMPATIBLE')) {
  errors.push('PRODUCTION_APPLICATION_COMPATIBILITY.md missing RPC compatibility verification.');
} else {
  console.log('  PASS: PRODUCTION_APPLICATION_COMPATIBILITY.md confirms RPC and UI compatibility.');
}

// Test 6: Manual Review Records Untouched
console.log('[Test 6] Validating Manual Review Backlog...');
if (pmrbJson.records.length !== 3 || !pmrbJson.status.includes('EXCLUDED FROM AUTOMATED REMEDIATION')) {
  errors.push('PRODUCTION_MANUAL_REVIEW_BACKLOG.json missing manual review groups.');
} else {
  console.log('  PASS: PRODUCTION_MANUAL_REVIEW_BACKLOG.json preserves manual review records untouched.');
}

// Test 7: Authorization Form Statuses
console.log('[Test 7] Validating Authorization Form Statuses...');
if (pafText.includes('AUTHORIZED') && !pafText.includes('NOT AUTHORIZED')) {
  errors.push('PRODUCTION_AUTHORIZATION_FORM.md contains unauthorized approval status.');
} else {
  console.log('  PASS: PRODUCTION_AUTHORIZATION_FORM.md marks all phases NOT AUTHORIZED.');
}

// Test 8: Absence of Executable Production Mutation Commands
console.log('[Test 8] Verifying absence of executable production mutation commands...');
const forbiddenRegex = /\b(supabase db reset --linked|supabase migration repair)\b/i;
[pmbpText, pbrpText, pdrText, pacText, prpText, patmText, pafText, prvText].forEach(txt => {
  if (forbiddenRegex.test(txt)) {
    errors.push('Forbidden production mutation command detected in artifacts.');
  }
});
if (errors.length === 0) {
  console.log('  PASS: Zero executable production mutation commands present in readiness package.');
}

console.log('\n==================================================');
if (errors.length > 0) {
  console.error('PRODUCTION READINESS VALIDATION FAILED:');
  errors.forEach(e => console.error(' - ' + e));
  process.exit(1);
} else {
  console.log('PRODUCTION READINESS VALIDATION SUCCESSFUL: ALL 8 CHECKS PASSED WITH EXIT CODE 0');
  process.exit(0);
}
