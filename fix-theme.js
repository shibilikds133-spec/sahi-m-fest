const fs = require('fs');
let code = fs.readFileSync('src/app/(admin)/index.tsx', 'utf8');

code = code.replace(/const NAVY.*/g, '');
code = code.replace(/const MUTED.*/g, '');
code = code.replace(/const PAGE_BG.*/g, '');
code = code.replace(/const BORDER.*/g, '');
code = code.replace(/const EMERALD =.*/g, '');
code = code.replace(/const EMERALD_DARK.*/g, '');
code = code.replace(/const SIDEBAR =.*/g, '');
code = code.replace(/const SIDEBAR_DARK.*/g, '');
code = code.replace(/const SUCCESS.*/g, '');
code = code.replace(/const WARNING.*/g, '');
code = code.replace(/const DANGER.*/g, '');
code = code.replace(/const INFO.*/g, '');

const uiImport = `import { ui } from '../../constants/designSystem';\n`;
if (!code.includes('designSystem')) {
  code = code.replace(/import \{ useAdminDashboard/, uiImport + 'import { useAdminDashboard');
}

code = code.replace(/const dashboardBgStyle = [\s\S]*?\} as any;/g, `const dashboardBgStyle = { backgroundColor: ui.colors.background };`);
code = code.replace(/const welcomeSurface = [\s\S]*?\} as any;/g, `const welcomeSurface = { backgroundColor: ui.colors.surface, borderColor: ui.colors.border, borderWidth: 1, borderRadius: 10, shadowColor: '#0F172A', shadowOpacity: 0.015, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 };`);
code = code.replace(/const cardSurface = [\s\S]*?\} as any;/g, `const cardSurface = { backgroundColor: ui.colors.surface, borderColor: ui.colors.border, borderWidth: 1, borderRadius: 10, shadowColor: '#0F172A', shadowOpacity: 0.015, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } };`);
code = code.replace(/const actionCardSurface = [\s\S]*?\} as any;/g, `const actionCardSurface = { backgroundColor: ui.colors.surface, borderColor: ui.colors.border, borderWidth: 1, borderRadius: 10, shadowColor: '#0F172A', shadowOpacity: 0.015, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 };`);
code = code.replace(/const panelSurface = [\s\S]*?\} as any;/g, `const panelSurface = { backgroundColor: ui.colors.surface, borderColor: ui.colors.border, borderWidth: 1, borderRadius: 10, shadowColor: '#0F172A', shadowOpacity: 0.015, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 };`);

code = code.replace(/color: MUTED/g, 'color: ui.colors.textMuted');
code = code.replace(/color: NAVY/g, 'color: ui.colors.text');
code = code.replace(/NAVY/g, 'ui.colors.text');
code = code.replace(/EMERALD_DARK/g, 'ui.colors.primary');
code = code.replace(/EMERALD/g, 'ui.colors.primary');

code = code.replace(/trend === 'down' \? DANGER : trend === 'neutral' \? MUTED : SUCCESS/g, `trend === 'down' ? ui.colors.destructive : trend === 'neutral' ? ui.colors.textMuted : ui.colors.success`);

fs.writeFileSync('src/app/(admin)/index.tsx', code);
console.log('AdminDashboard updated');
