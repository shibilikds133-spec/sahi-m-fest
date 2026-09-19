const fs = require('fs');
['src/components/layout/AdminAppShell.tsx', 'src/components/layout/TeamLeaderAppShell.tsx'].forEach(file => {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/color="#FFFFFF"/g, 'color={ui.colors.surface}');
  code = code.replace(/color="#475569"/g, 'color={ui.colors.textMuted}');
  code = code.replace(/color="#64748B"/g, 'color={ui.colors.textMuted}');
  code = code.replace(/color=\{(active \? .*? :) '#475569'\}/g, 'color={$1 ui.colors.textMuted}');
  // Text colors
  code = code.replace(/color: '#475569'/g, 'color: ui.colors.textMuted');
  code = code.replace(/color: active \? ui\.colors\.primary : '#475569'/g, 'color: active ? ui.colors.primary : ui.colors.textMuted');
  fs.writeFileSync(file, code);
});
console.log('Fixed app shells');
