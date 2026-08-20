const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const scriptDirectory = path.dirname(require.main.filename);
const policyPath = path.resolve(scriptDirectory, '../src/core/festival/templatePolicy.ts');
const source = fs.readFileSync(policyPath, 'utf8');
assert.equal(
  /\b(age|dob|class|education)\b/i.test(source),
  false,
  'College policy must not accept or inspect inference inputs',
);

const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true,
  },
  fileName: policyPath,
  reportDiagnostics: true,
});

assert.deepEqual(compiled.diagnostics, [], 'Template policy must transpile without diagnostics');

const policyModule = { exports: {} };
const executePolicy = new Function('exports', 'module', 'require', compiled.outputText);
executePolicy(policyModule.exports, policyModule, require);

const policy = policyModule.exports;

assert.deepEqual(policy.FESTIVAL_TEMPLATES, ['sahithyolsav', 'college_fest']);
assert.equal(policy.DEFAULT_FESTIVAL_TEMPLATE, 'sahithyolsav');
assert.equal(policy.getFestivalCategoryMode('sahithyolsav'), 'auto');
assert.equal(policy.getFestivalCategoryMode('college_fest'), 'manual');
assert.throws(() => policy.getFestivalCategoryMode('unknown'));

assert.deepEqual(policy.COLLEGE_FEST_CATEGORY_CODES, [
  'SUB_JUNIOR',
  'JUNIOR',
  'SENIOR',
]);

for (const code of policy.COLLEGE_FEST_CATEGORY_CODES) {
  assert.equal(policy.isCollegeFestCategory(code), true);
}

for (const code of ['LP', 'UP', 'HS', 'HSS', 'CAMPUS', 'GN', 'JR', 'SR']) {
  assert.equal(policy.isCollegeFestCategory(code), false);
  assert.equal(policy.normalizeCollegeFestCategoryInput(code), null);
}

const normalizationCases = {
  'Sub Junior': 'SUB_JUNIOR',
  'sub junior': 'SUB_JUNIOR',
  'SUB JUNIOR': 'SUB_JUNIOR',
  SUB_JUNIOR: 'SUB_JUNIOR',
  Junior: 'JUNIOR',
  Senior: 'SENIOR',
};

for (const [input, expected] of Object.entries(normalizationCases)) {
  assert.equal(policy.normalizeCollegeFestCategoryInput(input), expected);
}

assert.equal(policy.normalizeCollegeFestCategoryInput(''), null);
assert.equal(policy.normalizeCollegeFestCategoryInput(null), null);
assert.equal(policy.getCollegeFestCategoryLabel('SUB_JUNIOR'), 'Sub Junior');
assert.equal(policy.getCollegeFestCategoryLabel('JUNIOR'), 'Junior');
assert.equal(policy.getCollegeFestCategoryLabel('SENIOR'), 'Senior');
assert.equal(policy.getCollegeFestChestPrefix('SUB_JUNIOR'), 'SJ');
assert.equal(policy.getCollegeFestChestPrefix('JUNIOR'), 'JR');
assert.equal(policy.getCollegeFestChestPrefix('SENIOR'), 'SR');

assert.equal(policy.normalizeCollegeFestCategoryInput.length, 1);
assert.equal(policy.getFestivalCategoryMode.length, 1);

const participantValidationPath = path.resolve(
  scriptDirectory,
  '../src/core/utils/participantValidation.ts',
);
const participantValidationSource = fs.readFileSync(participantValidationPath, 'utf8');
const compiledParticipantValidation = ts.transpileModule(participantValidationSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true,
  },
  fileName: participantValidationPath,
  reportDiagnostics: true,
});

assert.deepEqual(
  compiledParticipantValidation.diagnostics,
  [],
  'Participant validation must transpile without diagnostics',
);

const participantValidationModule = { exports: {} };
const executeParticipantValidation = new Function(
  'exports',
  'module',
  'require',
  compiledParticipantValidation.outputText,
);
executeParticipantValidation(
  participantValidationModule.exports,
  participantValidationModule,
  (request) => {
    if (request === '../config/supabase') return { supabase: {} };
    return require(request);
  },
);

const participantValidation = participantValidationModule.exports;
assert.equal(participantValidation.getCategory({ class_std: 1 }, 2026), 'LP');
assert.equal(participantValidation.getCategory({ class_std: 5 }, 2026), 'UP');
assert.equal(participantValidation.getCategory({ class_std: 8 }, 2026), 'HS');
assert.equal(participantValidation.getCategory({ class_std: 11 }, 2026), 'HSS');
assert.equal(participantValidation.getCategory({ education_type: 'degree' }, 2026), 'CAMPUS');
assert.equal(participantValidation.getCategory({ dob: '2008-01-01' }, 2026), 'JUNIOR');
assert.equal(participantValidation.getCategory({ dob: '2003-01-01' }, 2026), 'SENIOR');
assert.equal(participantValidation.validateParticipant({ class_std: 1 }, 2026), 'LP');

console.log('Template policy verification passed.');
