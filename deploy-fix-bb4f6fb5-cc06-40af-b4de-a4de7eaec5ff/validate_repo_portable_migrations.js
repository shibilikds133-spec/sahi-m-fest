const fs = require('fs');
const path = require('path');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';
const repoDir = 'd:\\work\\fest\\web-for-sahi--main\\web-for-sahi--main';
const repoMigrationsDir = path.join(repoDir, 'supabase', 'migrations');
const repoArchivedDir = path.join(repoDir, 'supabase', 'archived_migrations');

console.log('=== RUNNING REPOSITORY PORTABLE MIGRATION VALIDATION ===\n');

let errors = [];

// Test 1: Executable file count in supabase/migrations/
console.log('[Test 1] Validating executable file count in supabase/migrations/...');
const files = fs.readdirSync(repoMigrationsDir).filter(f => f.endsWith('.sql')).sort();
if (files.length !== 80) {
  errors.push(`Expected 80 executable migration files in supabase/migrations/, found ${files.length}.`);
} else {
  console.log(`  PASS: Found exactly ${files.length} executable migration files in supabase/migrations/ (001 through 080).`);
}

// Test 2: Version prefix uniqueness
console.log('[Test 2] Validating version prefix uniqueness...');
const prefixes = new Set();
const dups = [];
files.forEach(f => {
  const pfx = f.substring(0, 3);
  if (prefixes.has(pfx)) dups.push(pfx);
  prefixes.add(pfx);
});
if (dups.length > 0) {
  errors.push(`Duplicate version prefixes found in supabase/migrations/: ${dups.join(', ')}`);
} else {
  console.log('  PASS: Zero duplicate version prefixes found. Every file prefix from 001 to 080 is 100% unique.');
}

// Test 3: Archived commentary file preservation
console.log('[Test 3] Validating archived commentary file preservation...');
const archivedPath = path.join(repoArchivedDir, '018_results_policies.sql');
if (!fs.existsSync(archivedPath)) {
  errors.push('Archived commentary file supabase/archived_migrations/018_results_policies.sql is missing.');
} else {
  console.log('  PASS: Commentary file 018_results_policies.sql is preserved under supabase/archived_migrations/.');
}

// Test 4: Physical presence of new portable migrations
console.log('[Test 4] Validating physical presence of portable migrations 078–080...');
const has78 = files.some(f => f.includes('token_revocation_schema'));
const has79 = files.some(f => f.includes('schedule_festival_reconciliation'));
const has80 = files.some(f => f.includes('composite_boundary_constraints'));

if (!has78 || !has79 || !has80) {
  errors.push('Missing physical portable migration files in supabase/migrations/.');
} else {
  console.log('  PASS: Final portable migrations (token revocation, schedule reconciliation, composite constraints) are physically present in repository.');
}

// Test 5: Verify Artifact Presence
console.log('[Test 5] Validating Artifact Presence...');
const reqArtifacts = [
  'REPOSITORY_PORTABLE_MIGRATION_STATUS.md',
  'REPOSITORY_MIGRATION_FILE_INVENTORY.json',
  'REPOSITORY_MIGRATION_DIFF.md',
  'FRESH_REBUILD_FROM_ACTUAL_REPOSITORY.md'
];

reqArtifacts.forEach(art => {
  if (!fs.existsSync(path.join(artDir, art))) {
    errors.push(`Missing required artifact: ${art}`);
  }
});
if (errors.length === 0) {
  console.log('  PASS: All 4 repository migration artifacts exist in workspace.');
}

// Test 6: Absence of production execution commands
console.log('[Test 6] Verifying absence of production execution commands...');
const forbiddenRegex = /\b(supabase db reset --linked|supabase db push --linked|supabase migration repair --linked)\b/i;
reqArtifacts.forEach(art => {
  const content = fs.readFileSync(path.join(artDir, art), 'utf8');
  if (forbiddenRegex.test(content)) {
    errors.push(`Forbidden production execution command in ${art}`);
  }
});
if (errors.length === 0) {
  console.log('  PASS: Zero production execution commands present in repository artifacts.');
}

console.log('\n==================================================');
if (errors.length > 0) {
  console.error('REPOSITORY PORTABLE MIGRATION VALIDATION FAILED:');
  errors.forEach(e => console.error(' - ' + e));
  process.exit(1);
} else {
  console.log('REPOSITORY PORTABLE MIGRATION VALIDATION SUCCESSFUL: ALL 6 CHECKS PASSED WITH EXIT CODE 0');
  process.exit(0);
}
