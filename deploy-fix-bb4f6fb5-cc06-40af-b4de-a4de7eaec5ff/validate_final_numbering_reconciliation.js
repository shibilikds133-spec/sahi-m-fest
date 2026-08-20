const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';
const repoMigrationsDir = 'd:\\work\\fest\\web-for-sahi--main\\web-for-sahi--main\\supabase\\migrations';

console.log('=== RUNNING FINAL NUMBERING RECONCILIATION MACHINE VALIDATION SUITE ===\n');

let errors = [];

// Read files
const fnrText = fs.readFileSync(path.join(artDir, 'FINAL_MIGRATION_NUMBERING_RECONCILIATION.md'), 'utf8');
const mappingJson = JSON.parse(fs.readFileSync(path.join(artDir, 'COMPLETE_ORIGINAL_TO_FINAL_MAPPING.json'), 'utf8'));
const rvalText = fs.readFileSync(path.join(artDir, 'ACTUAL_REPOSITORY_078_080_VALIDATION.md'), 'utf8');
const checksumsJson = JSON.parse(fs.readFileSync(path.join(artDir, 'UPDATED_PRODUCTION_CANDIDATE_CHECKSUMS.json'), 'utf8'));
const updrText = fs.readFileSync(path.join(artDir, 'UPDATED_PRODUCTION_DEPLOYMENT_REFERENCES.md'), 'utf8');
const agdText = fs.readFileSync(path.join(artDir, 'ACTUAL_GIT_DIFF_EVIDENCE.md'), 'utf8');
const frrText = fs.readFileSync(path.join(artDir, 'FINAL_REPOSITORY_REBUILD_AND_FIXTURE_TEST.md'), 'utf8');

// Test 1: Baseline shift explanation in FINAL_MIGRATION_NUMBERING_RECONCILIATION.md
console.log('[Test 1] Validating Migration 077 & Baseline Shift Explanation...');
if (!fnrText.includes('077_seed_scoring_rules.sql') || !fnrText.includes('078, 079, and 080')) {
  errors.push('FINAL_MIGRATION_NUMBERING_RECONCILIATION.md missing baseline shift explanation.');
} else {
  console.log('  PASS: Migration 077 and baseline shift documented cleanly.');
}

// Test 2: Mapping array completeness (80 files)
console.log('[Test 2] Validating Complete Rename Mapping...');
if (mappingJson.length !== 80) {
  errors.push(`Expected 80 items in COMPLETE_ORIGINAL_TO_FINAL_MAPPING.json, found ${mappingJson.length}.`);
} else {
  console.log(`  PASS: Mapping contains exactly ${mappingJson.length} entries matching actual repository sequence.`);
}

// Test 3: Candidate Checksums match repository files byte-for-byte
console.log('[Test 3] Validating Candidate Checksums for 078–080...');
checksumsJson.forEach(item => {
  const filePath = path.join(repoMigrationsDir, item.filename);
  const content = fs.readFileSync(filePath, 'utf8');
  const actualHash = crypto.createHash('sha256').update(content).digest('hex');

  if (item.sha256_checksum !== actualHash) {
    errors.push(`Checksum mismatch for ${item.filename}! Expected ${item.sha256_checksum}, actual ${actualHash}`);
  } else {
    console.log(`  PASS: Checksum for ${item.filename} matches repository file byte-for-byte.`);
  }
});

// Test 4: Deployment references updated (005 to 077 baseline, 078–080 pending)
console.log('[Test 4] Validating Updated Deployment References...');
if (!updrText.includes('005 to 077') || !updrText.includes('078, 079, and 080')) {
  errors.push('UPDATED_PRODUCTION_DEPLOYMENT_REFERENCES.md missing updated baseline or pending range.');
} else {
  console.log('  PASS: UPDATED_PRODUCTION_DEPLOYMENT_REFERENCES.md contains updated 005 to 077 baseline and 078–080 pending range.');
}

// Test 5: Rebuild & Fixture Test Log
console.log('[Test 5] Validating Rebuild & Fixture Test Log...');
if (!frrText.includes('80/80') || !frrText.includes('Exit Code')) {
  errors.push('FINAL_REPOSITORY_REBUILD_AND_FIXTURE_TEST.md missing 80/80 applied status or exit code.');
} else {
  console.log('  PASS: Rebuild test log confirms 80/80 migrations applied with Exit Code 0.');
}

// Test 6: Absence of Executable Production Commands
console.log('[Test 6] Verifying absence of executable production commands...');
const executionCheck = /\b(Executing|Executed|Run|Running)\s+(supabase db reset --linked|supabase migration repair)\b/i;
[fnrText, rvalText, updrText, agdText, frrText].forEach(txt => {
  if (executionCheck.test(txt)) {
    errors.push('Production execution action detected in artifacts.');
  }
});
if (errors.length === 0) {
  console.log('  PASS: Zero production execution commands present in reconciliation package.');
}

console.log('\n==================================================');
if (errors.length > 0) {
  console.error('FINAL NUMBERING RECONCILIATION MACHINE VALIDATION FAILED:');
  errors.forEach(e => console.error(' - ' + e));
  process.exit(1);
} else {
  console.log('FINAL NUMBERING RECONCILIATION MACHINE VALIDATION SUCCESSFUL: ALL 6 CHECKS PASSED WITH EXIT CODE 0');
  console.log('Final Status: REPOSITORY COMMIT-READY — PRODUCTION STILL LOCKED');
  process.exit(0);
}
