const fs = require('fs');
const path = require('path');

const repoDir = 'd:\\work\\fest\\web-for-sahi--main\\web-for-sahi--main\\supabase\\migrations';
const rootDir = 'd:\\work\\fest\\web-for-sahi--main\\web-for-sahi--main';

console.log('--- 018_phase5_judges_marks_results.sql ---');
console.log(fs.readFileSync(path.join(repoDir, '018_phase5_judges_marks_results.sql'), 'utf8').substring(0, 300));

console.log('\n--- 018_results_policies.sql ---');
console.log(fs.readFileSync(path.join(repoDir, '018_results_policies.sql'), 'utf8').substring(0, 300));

console.log('\n--- 022_scoring_rules.sql ---');
console.log(fs.readFileSync(path.join(repoDir, '022_scoring_rules.sql'), 'utf8').substring(0, 300));

console.log('\n--- 022_validate_judge_token_rpc.sql ---');
console.log(fs.readFileSync(path.join(repoDir, '022_validate_judge_token_rpc.sql'), 'utf8').substring(0, 300));

console.log('\n--- 063_official_participant_bracket.sql ---');
console.log(fs.readFileSync(path.join(rootDir, '063_official_participant_bracket.sql'), 'utf8').substring(0, 300));
