const fs = require('fs');
let code = fs.readFileSync('src/constants/designSystem.ts', 'utf8');

if (!code.includes('warningSoft')) {
  code = code.replace(/warning: v\('--ssf-warning', '#B45309'\),/, "warning: v('--ssf-warning', '#B45309'),\n    warningSoft: v('--ssf-warning-soft', '#FEF3C7'),");
}
if (!code.includes('destructiveSoft')) {
  code = code.replace(/destructive: v\('--ssf-destructive', '#DC2626'\),/, "destructive: v('--ssf-destructive', '#DC2626'),\n    destructiveSoft: v('--ssf-destructive-soft', '#FEE2E2'),");
}

fs.writeFileSync('src/constants/designSystem.ts', code);
console.log('Added soft colors to designSystem.ts');
