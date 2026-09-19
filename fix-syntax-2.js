const fs = require('fs');

// Fix 1: useJudges.ts
let code = fs.readFileSync('src/core/hooks/useJudges.ts', 'utf8');
code = code.replace(/getSupabase\(\)/, 'supabase');
code = code.replace(/criteriaScores,\\n        p_total_mark:/, 'criteriaScores,\n        p_total_mark:');
fs.writeFileSync('src/core/hooks/useJudges.ts', code);

// Fix 2: index.tsx
let indexCode = fs.readFileSync('src/app/(admin)/index.tsx', 'utf8');
// Strip BOM
if (indexCode.charCodeAt(0) === 0xFEFF) indexCode = indexCode.slice(1);
// Strip weird characters
indexCode = indexCode.replace(/[\uFFFD]/g, '');
indexCode = indexCode.replace(/const PAGE_BG[^\n]+/, "const PAGE_BG = '#E2E8F0';");
fs.writeFileSync('src/app/(admin)/index.tsx', indexCode);

// Fix 3: participants/[id]/index.tsx
let partCode = fs.readFileSync('src/app/(admin)/participants/[id]/index.tsx', 'utf8');
// Strip BOM
if (partCode.charCodeAt(0) === 0xFEFF) partCode = partCode.slice(1);
partCode = partCode.replace(/[\uFFFD]/g, '');
fs.writeFileSync('src/app/(admin)/participants/[id]/index.tsx', partCode);

console.log('Fixed syntax errors');
