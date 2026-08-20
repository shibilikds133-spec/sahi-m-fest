const fs = require('fs');
const path = require('path');

const migDir = path.join(process.cwd(), 'supabase', 'migrations');
const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();

console.log('Total migration files in supabase/migrations:', files.length);

// 1. Analyze versions and duplicates
const versionMap = new Map();
files.forEach(f => {
  const prefix = f.split('_')[0];
  if (!versionMap.has(prefix)) versionMap.set(prefix, []);
  versionMap.get(prefix).push(f);
});

const duplicates = [];
for (const [prefix, fileList] of versionMap.entries()) {
  if (fileList.length > 1) {
    duplicates.push({ prefix, fileList });
  }
}

console.log('Duplicate version prefixes found:', duplicates);

// 2. Extract ALL function definitions from migration files and analyze them
const functionsList = [];
let funcId = 1;

files.forEach(f => {
  const content = fs.readFileSync(path.join(migDir, f), 'utf-8');
  // Regex to match functions
  const funcRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*RETURNS\s+([\s\S]*?)(?:LANGUAGE|AS|\$\$)/gi;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    const funcName = match[1];
    const args = match[2].trim().replace(/\s+/g, ' ');
    const returnType = match[3].trim().replace(/\s+/g, ' ');

    const bodySnippet = content.slice(match.index, match.index + 2000);
    const isSecurityDefiner = /SECURITY\s+DEFINER/i.test(bodySnippet);
    const hasSearchPath = /SET\s+search_path\s*=/i.test(bodySnippet);
    const searchPathMatch = bodySnippet.match(/SET\s+search_path\s*=\s*([^;\$\n]+)/i);

    functionsList.push({
      id: funcId++,
      name: funcName,
      args: args || 'void',
      returnType,
      file: f,
      isSecurityDefiner,
      hasSearchPath,
      searchPathVal: searchPathMatch ? searchPathMatch[1].trim() : 'NONE'
    });
  }
});

console.log(`Extracted ${functionsList.length} function definitions from migration files.`);

fs.writeFileSync('migration_analysis.json', JSON.stringify({
  totalFiles: files.length,
  uniqueVersions: versionMap.size,
  duplicates,
  functionsCount: functionsList.length,
  functions: functionsList
}, null, 2));

console.log('Wrote migration_analysis.json');
