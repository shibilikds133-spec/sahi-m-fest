const fs = require('fs');
const report = JSON.parse(fs.readFileSync('migration_analysis.json', 'utf-8'));
const functions = report.functions;

console.log(`Processing ${functions.length} functions for complete matrix...`);

// Group functions by name to identify overloads
const overloadMap = new Map();
functions.forEach(fn => {
  if (!overloadMap.has(fn.name)) overloadMap.set(fn.name, []);
  overloadMap.get(fn.name).push(fn);
});

console.log(`Unique function names: ${overloadMap.size}`);

// Read src files to match callers
const scanReport = JSON.parse(fs.readFileSync('scan_report.json', 'utf-8'));

let idx = 1;
let md = ``;

for (const fn of functions) {
  const rpcRef = scanReport.rpcRefs.filter(r => r.rpc === fn.name);
  let callerStr = 'Database / Internal';
  if (rpcRef.length > 0) {
    const files = Array.from(new Set(rpcRef.map(r => r.file)));
    callerStr = `Frontend (${files.slice(0, 2).join(', ')})`;
  } else if (fn.name.startsWith('execute_')) {
    callerStr = 'Frontend Import Module (SupabaseDatabaseProvider)';
  } else if (fn.name.startsWith('stage_')) {
    callerStr = 'Stage Management Module';
  } else if (fn.name.startsWith('assign_') || fn.name.startsWith('trg_')) {
    callerStr = 'Database Trigger';
  } else if (fn.name.startsWith('get_my_') || fn.name === 'is_superadmin') {
    callerStr = 'RLS Policy Helper (Internal)';
  }

  let curGrants = 'PUBLIC (default)';
  let intGrants = 'authenticated';
  if (['get_public_leaderboard', 'get_public_published_results', 'get_public_candidate_profile', 'get_public_unit_profile', 'validate_judge_token', 'log_judge_activity', 'get_judge_registrations', 'stage_verify_token'].includes(fn.name)) {
    curGrants = 'anon, authenticated';
    intGrants = 'anon, authenticated';
  } else if (['handle_new_user'].includes(fn.name)) {
    curGrants = 'service_role';
    intGrants = 'service_role';
  }

  const secDefiner = fn.isSecurityDefiner ? 'SECURITY DEFINER' : 'SECURITY INVOKER';
  const searchPathStatus = fn.hasSearchPath ? `SET search_path = ${fn.searchPathVal}` : '**MISSING**';
  const recSearchPath = fn.isSecurityDefiner ? "`SET search_path = ''` (fully schema-qualified)" : "`N/A` (SECURITY INVOKER)";

  md += `| ${idx++} | \`${fn.name}\` | \`(${fn.args.replace(/\|/g, '\\|')})\` | \`${fn.file}\` | \`${secDefiner}\` | ${searchPathStatus} | ${callerStr} | \`${curGrants}\` | \`${intGrants}\` | ${recSearchPath} |\n`;
}

fs.writeFileSync('full_79_function_matrix.md', md);
console.log('Saved full_79_function_matrix.md');
