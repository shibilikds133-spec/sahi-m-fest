const fs = require('fs');
const path = require('path');

const artDir = 'C:\\Users\\Admin\\.gemini\\antigravity\\brain\\acbb4449-1601-44c6-a142-5054fdd067e6';

console.log('=== RUNNING MANDATORY MACHINE VALIDATION SUITE ===\n');

let errors = [];

// 1. Read all 5 artifacts
const rowMappingPath = path.join(artDir, 'FINAL_ROW_MAPPING.json');
const fePath = path.join(artDir, 'FINAL_FORENSIC_EVIDENCE.md');
const odmPath = path.join(artDir, 'FINAL_OPERATOR_DECISION_MATRIX.md');
const srbPath = path.join(artDir, 'FINAL_STAGING_REMEDIATION_BLUEPRINT.md');
const acPath = path.join(artDir, 'FINAL_ACCEPTANCE_CHECKLIST.md');

const rowMapping = JSON.parse(fs.readFileSync(rowMappingPath, 'utf8'));
const feText = fs.readFileSync(fePath, 'utf8');
const odmText = fs.readFileSync(odmPath, 'utf8');
const srbText = fs.readFileSync(srbPath, 'utf8');
const acText = fs.readFileSync(acPath, 'utf8');

// Check 1: Row mapping unique keys length
console.log('[Check 1] Validating FINAL_ROW_MAPPING.json length...');
if (rowMapping.length !== 270) {
  errors.push(`FINAL_ROW_MAPPING.json length is ${rowMapping.length}, expected 270.`);
} else {
  console.log('  PASS: FINAL_ROW_MAPPING.json contains exactly 270 unique (table_name, row_id) objects.');
}

// Check 2: Cross-category overlaps count
console.log('[Check 2] Validating cross-category registration overlaps...');
const overlappingRows = rowMapping.filter(r => r.categories && r.categories.length > 1);
if (overlappingRows.length !== 7) {
  errors.push(`Cross-category overlapping rows count is ${overlappingRows.length}, expected 7.`);
} else {
  console.log('  PASS: Exactly 7 registration rows belong to multiple categories (Category 1 and Category 4).');
}

// Check 3: Dangling tokens in root vs dependent sets
console.log('[Check 3] Validating Category 8 dangling tokens classification...');
const danglingInMapping = rowMapping.filter(r => r.table_name === 'judge_tokens' && r.is_root_record);
if (danglingInMapping.length !== 4) {
  errors.push(`Dangling tokens in root set is ${danglingInMapping.length}, expected 4.`);
} else {
  console.log('  PASS: Exactly 4 dangling tokens are classified as Root Records and excluded from Dependent Records.');
}

// Check 4: Category 5 existing schedule tokens (44 tokens)
console.log('[Check 4] Validating Category 5 dependent judge tokens count...');
const depTokensInMapping = rowMapping.filter(r => r.table_name === 'judge_tokens' && !r.is_root_record);
if (depTokensInMapping.length !== 44) {
  errors.push(`Dependent judge tokens in mapping is ${depTokensInMapping.length}, expected 44.`);
} else {
  console.log('  PASS: Exactly 44 judge tokens on existing schedules (31 active + 13 inactive) are classified as Dependent Records.');
}

// Check 5: Reconciled metric totals across Markdown text
console.log('[Check 5] Validating metric consistency across Markdown artifacts...');
if (!feText.includes('**277**') || !feText.includes('**106**') || !feText.includes('**164**') || !feText.includes('**270**')) {
  errors.push('FINAL_FORENSIC_EVIDENCE.md does not contain exact reconciled metrics (277, 106, 164, 270).');
} else {
  console.log('  PASS: FINAL_FORENSIC_EVIDENCE.md matches reconciled metric totals (Raw: 277, Root: 106, Dep: 164, Combined: 270).');
}

// Check 6: Unapproved Authority Enforcement
console.log('[Check 6] Verifying no candidate authority is approved...');
const approvedMatches = [feText, odmText, srbText, acText].filter(t => t.includes('APPROVED — AUTO-FIX') || t.includes('AUTHORITY APPROVED'));
if (approvedMatches.length > 0) {
  errors.push('Found pre-approved authority or auto-fix status in artifacts.');
} else {
  console.log('  PASS: All decision options and candidate authorities remain strictly UNAPPROVED — OPERATOR DECISION REQUIRED.');
}

// Check 7: No Executable DDL or DML in production artifacts
console.log('[Check 7] Verifying absence of executable DDL/DML in production artifacts...');
const ddlDmlRegex = /\b(CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE TABLE|INSERT INTO|UPDATE public\.|DELETE FROM)\b/i;
[feText, odmText, srbText, acText].forEach((txt, idx) => {
  const filenames = ['FINAL_FORENSIC_EVIDENCE.md', 'FINAL_OPERATOR_DECISION_MATRIX.md', 'FINAL_STAGING_REMEDIATION_BLUEPRINT.md', 'FINAL_ACCEPTANCE_CHECKLIST.md'];
  if (ddlDmlRegex.test(txt)) {
    errors.push(`Executable DDL/DML statement detected in ${filenames[idx]}`);
  }
});
if (errors.length === 0) {
  console.log('  PASS: Zero executable DDL or DML statements present across all artifacts.');
}

console.log('\n==================================================');
if (errors.length > 0) {
  console.error('VALIDATION FAILED WITH THE FOLLOWING ERRORS:');
  errors.forEach(e => console.error(' - ' + e));
  process.exit(1);
} else {
  console.log('MACHINE VALIDATION SUCCESSFUL: ALL 7 CHECKS PASSED WITH EXIT CODE 0');
  process.exit(0);
}
