const fs = require('fs');
let code = fs.readFileSync('src/app/(admin)/index.tsx', 'utf8');

code = code.replace(/\bPAGE_BG\b/g, 'ui.colors.background');
code = code.replace(/\bSIDEBAR_DARK\b/g, 'ui.colors.sidebarSoft');
code = code.replace(/\bSIDEBAR\b/g, 'ui.colors.sidebar');

fs.writeFileSync('src/app/(admin)/index.tsx', code);
console.log('Fixed inline PAGE_BG and SIDEBAR usages in index.tsx');
