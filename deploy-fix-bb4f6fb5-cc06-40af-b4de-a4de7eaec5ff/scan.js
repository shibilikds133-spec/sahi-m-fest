const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('.temp') && !file.includes('.mimocode')) {
        results = results.concat(walk(file));
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.sql')) {
      results.push(file);
    }
  });
  return results;
}

const allFiles = walk(process.cwd());
const srcFiles = allFiles.filter(f => f.includes(path.sep + 'src' + path.sep));
const migrationFiles = allFiles.filter(f => f.includes(path.sep + 'supabase' + path.sep + 'migrations' + path.sep));

console.log(`Scanning ${srcFiles.length} source files and ${migrationFiles.length} migration files...`);

// 1. Scan Frontend RPC & Table calls
const rpcRefs = [];
const tableRefs = [];

srcFiles.forEach(f => {
  const relPath = path.relative(process.cwd(), f);
  const content = fs.readFileSync(f, 'utf-8');

  // match supabase.rpc('func_name', { ... })
  const rpcRegex = /\.rpc\s*\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = rpcRegex.exec(content)) !== null) {
    rpcRefs.push({ rpc: match[1], file: relPath });
  }

  // match supabase.from('table_or_view')
  const fromRegex = /\.from\s*\(\s*['"]([^'"]+)['"]/g;
  while ((match = fromRegex.exec(content)) !== null) {
    tableRefs.push({ table: match[1], file: relPath });
  }
});

// 2. Scan Functions in Migrations
const functions = {};

migrationFiles.sort().forEach(f => {
  const migName = path.basename(f);
  const content = fs.readFileSync(f, 'utf-8');
  
  // Find CREATE OR REPLACE FUNCTION or CREATE FUNCTION
  const funcRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)(?:LANGUAGE|AS|\$\$)/gi;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    const funcName = match[1];
    const argsStr = match[2].trim().replace(/\s+/g, ' ');
    const returnType = match[3].trim().replace(/\s+/g, ' ');
    
    // Look ahead to check SECURITY DEFINER and SET search_path
    const bodySnippet = content.slice(match.index, match.index + 1200);
    const isSecurityDefiner = /SECURITY\s+DEFINER/i.test(bodySnippet);
    const hasSearchPath = /SET\s+search_path\s*=/i.test(bodySnippet);

    functions[funcName] = {
      name: funcName,
      args: argsStr,
      returnType: returnType,
      file: migName,
      isSecurityDefiner,
      hasSearchPath,
      snippet: bodySnippet.slice(0, 300)
    };
  }
});

// 3. Scan column usage in repo for expires_at, is_active, mark_entries.festival_id
const columnUsage = {
  expires_at: [],
  is_active: [],
  mark_entries_festival_id: []
};

allFiles.forEach(f => {
  const relPath = path.relative(process.cwd(), f);
  const content = fs.readFileSync(f, 'utf-8');
  if (content.includes('expires_at')) columnUsage.expires_at.push(relPath);
  if (content.includes('is_active')) columnUsage.is_active.push(relPath);
  if (content.includes('mark_entries') && content.includes('festival_id')) columnUsage.mark_entries_festival_id.push(relPath);
});

const report = {
  totalFunctions: Object.keys(functions).length,
  functions,
  rpcRefs,
  uniqueRpcsInSrc: Array.from(new Set(rpcRefs.map(r => r.rpc))),
  uniqueTablesInSrc: Array.from(new Set(tableRefs.map(t => t.table))),
  columnUsageSummary: {
    expires_at_files: columnUsage.expires_at.length,
    is_active_files: columnUsage.is_active.length,
    mark_entries_festival_id_files: columnUsage.mark_entries_festival_id.length
  },
  columnUsage
};

fs.writeFileSync(path.join(process.cwd(), 'scan_report.json'), JSON.stringify(report, null, 2));
console.log(`Scan completed! Found ${Object.keys(functions).length} functions, ${report.uniqueRpcsInSrc.length} unique RPCs called in src, and detailed column usage.`);
