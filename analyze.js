const fs = require('fs');
const report = JSON.parse(fs.readFileSync('scan_report.json', 'utf-8'));

console.log('=== UNIQUE RPCS CALLED IN SRC ===');
report.uniqueRpcsInSrc.sort().forEach(rpc => {
  const callers = report.rpcRefs.filter(r => r.rpc === rpc).map(r => r.file);
  console.log(`- ${rpc} (called in ${callers.length} files: ${callers.slice(0, 3).join(', ')}${callers.length > 3 ? '...' : ''})`);
});

console.log('\n=== COLUMN USAGE SUMMARY ===');
console.log('expires_at files:', report.columnUsage.expires_at);
console.log('is_active files:', report.columnUsage.is_active.slice(0, 10), 'total:', report.columnUsage.is_active.length);
console.log('mark_entries festival_id files:', report.columnUsage.mark_entries_festival_id);

console.log('\n=== TABLES/VIEWS ACCESSED IN SRC ===');
console.log(report.uniqueTablesInSrc.sort().join(', '));
