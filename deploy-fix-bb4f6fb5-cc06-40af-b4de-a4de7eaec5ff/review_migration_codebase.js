const fs = require('fs');
const path = require('path');

const repoDir = 'd:\\work\\fest\\web-for-sahi--main\\web-for-sahi--main\\supabase\\migrations';
const files = fs.readdirSync(repoDir).filter(f => f.endsWith('.sql'));

console.log('=== INSPECTING REPOSITORY MIGRATIONS FOR TOKEN & SCHEDULE LOGIC ===\n');

const tokenRefs = [];
const schedRefs = [];
const rlsRefs = [];

files.forEach(file => {
  const content = fs.readFileSync(path.join(repoDir, file), 'utf8');
  if (content.includes('judge_tokens')) {
    tokenRefs.push(file);
  }
  if (content.includes('CREATE POLICY') || content.includes('ALTER TABLE')) {
    rlsRefs.push(file);
  }
});

console.log('Files referencing judge_tokens:', tokenRefs);
console.log('Total Migration Files:', files.length);

// Inspect 018_phase5_judges_marks_results.sql specifically
const m18 = fs.readFileSync(path.join(repoDir, '018_phase5_judges_marks_results.sql'), 'utf8');
console.log('\n--- 018_phase5_judges_marks_results.sql Snippet ---');
const lines = m18.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('judge_tokens') || line.includes('schedules') || line.includes('mark_entries')) {
    console.log(`L${idx+1}: ${line}`);
  }
});
