const fs = require('fs');
const path = require('path');

const report = JSON.parse(fs.readFileSync('scan_report.json', 'utf-8'));
const functions = report.functions;

console.log(`Total functions tracked: ${Object.keys(functions).length}`);

// Dump as Markdown table
let md = `| # | Function Name | Signature | Defined In | SECURITY DEFINER? | search_path in Repo | Frontend / System Caller | Target Role Grants | Recommended search_path |
|---|---|---|---|---|---|---|---|---|
`;

let idx = 1;
for (const [name, fn] of Object.entries(functions)) {
  const rpcRef = report.rpcRefs.filter(r => r.rpc === name);
  let callerStr = 'Database / Internal';
  if (rpcRef.length > 0) {
    const files = Array.from(new Set(rpcRef.map(r => r.file)));
    callerStr = `Frontend (${files.slice(0, 2).join(', ')})`;
  } else if (name.startsWith('execute_')) {
    callerStr = 'Frontend Import Module (SupabaseDatabaseProvider)';
  } else if (name.startsWith('stage_')) {
    callerStr = 'Stage Management Module';
  } else if (name.startsWith('assign_') || name.startsWith('trg_')) {
    callerStr = 'Database Trigger';
  } else if (name.startsWith('get_my_') || name === 'is_superadmin') {
    callerStr = 'RLS Helper (Internal)';
  }

  let roles = 'authenticated';
  if (['get_public_leaderboard', 'get_public_published_results', 'get_public_candidate_profile', 'get_public_unit_profile', 'validate_judge_token', 'log_judge_activity', 'get_judge_registrations', 'stage_verify_token'].includes(name)) {
    roles = 'anon, authenticated';
  } else if (['handle_new_user'].includes(name)) {
    roles = 'service_role';
  }

  const recSearchPath = fn.isSecurityDefiner ? "SET search_path = '' (schema-qualified)" : "N/A (SECURITY INVOKER)";

  md += `| ${idx++} | \`${name}\` | \`(${fn.args.slice(0, 40)}${fn.args.length > 40 ? '...' : ''})\` | \`${fn.file}\` | ${fn.isSecurityDefiner ? 'YES' : 'NO'} | ${fn.hasSearchPath ? '`public`' : '**MISSING**'} | ${callerStr} | \`${roles}\` | ${recSearchPath} |\n`;
}

fs.writeFileSync('function_matrix.md', md);
console.log('Saved function_matrix.md');
