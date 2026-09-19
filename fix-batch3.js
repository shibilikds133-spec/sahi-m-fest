const fs = require('fs');

const filesToFix = [
  'src/app/(admin)/judges/index.tsx',
  'src/app/(admin)/index.tsx',
  'src/components/layout/AdminAppShell.tsx',
  'src/app/(admin)/settings/leaderboard/controls.tsx',
  'src/app/(admin)/settings/leaderboard/item-results.tsx',
  'src/app/(admin)/settings/leaderboard/individual-rankings.tsx',
  'src/app/(admin)/settings/leaderboard/unit-rankings.tsx',
  'src/app/(admin)/settings/leaderboard/_layout.tsx',
  'src/app/(admin)/schedule/index.tsx',
  'src/app/(admin)/participants/[id]/index.tsx',
  'src/app/team/dashboard.tsx'
];

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const colorMap = {
  "'#F6FAFC'": 'ui.colors.background',
  "'#F8FCFD'": 'ui.colors.background',
  "'#FFFFFF'": 'ui.colors.surface',
  "'#FFF'": 'ui.colors.surface',
  "'#0F172A'": 'ui.colors.text',
  "'#333'": 'ui.colors.text',
  "'#64748B'": 'ui.colors.textMuted',
  "'#D1D5DB'": 'ui.colors.border',
  "'#DDEAF1'": 'ui.colors.border',
  "'#DDEEEB'": 'ui.colors.border',
  "'#D8E0EA'": 'ui.colors.border',
  "'#EEF5F8'": 'ui.colors.border',
  "'#0F2A45'": 'ui.shadow.shadowColor',
  "'#102A43'": 'ui.shadow.shadowColor',
  "'#000000'": 'ui.shadow.shadowColor',
};

for (const file of filesToFix) {
  if (!fs.existsSync(file)) continue;
  let code = fs.readFileSync(file, 'utf8');

  // Fix tailwind classes in judges/index.tsx
  code = code.replace(/bg-\[\#E8F5E9\]/g, 'bg-ui-success-soft border-ui-border');
  code = code.replace(/text-\[\#123B63\]/g, 'text-ui-primary');
  code = code.replace(/bg-\[\#123B63\]/g, 'bg-ui-primary');
  code = code.replace(/border-\[\#123B63\]/g, 'border-ui-primary');
  
  // Fix leaderboard internal `colors` object mapping
  code = code.replace(/card:\s*['"]#FFFFFF['"]/g, 'card: ui.colors.surface');
  code = code.replace(/bg:\s*['"]#F3F8FB['"]/g, 'bg: ui.colors.background');
  code = code.replace(/border:\s*['"]#DDEAF1['"]/g, 'border: ui.colors.border');
  code = code.replace(/text:\s*['"]#0F172A['"]/g, 'text: ui.colors.text');
  code = code.replace(/muted:\s*['"]#64748B['"]/g, 'muted: ui.colors.textMuted');
  code = code.replace(/soft:\s*['"]#EAF7FA['"]/g, 'soft: ui.colors.infoSoft');
  
  // Replace colors mapping properly (props vs styles)
  for (const [hex, token] of Object.entries(colorMap)) {
    // Only map `#000000`, wait, we shouldn't map '#000' randomly. I didn't include `#000` to avoid breaking print views!
    const hexVal = hex.substring(1, hex.length - 1); 
    const hexValEscaped = escapeRegExp(hexVal);
    
    // Replace JSX props: color="#FFF" -> color={ui.colors.surface}
    const regexProp = new RegExp(`(\\w+)=([\\'\\"])${hexValEscaped}\\2`, 'gi');
    code = code.replace(regexProp, `$1={${token}}`);

    // Replace style object values: '#FFF' -> ui.colors.surface
    const regexStyle = new RegExp(`([\\'\\"])${hexValEscaped}\\1`, 'gi');
    code = code.replace(regexStyle, token);
  }
  
  // Fix StatCard iconBg
  code = code.replace(/iconBg=['"]#EAF1FF['"]/g, 'iconBg={ui.colors.primarySoft}');
  code = code.replace(/iconBg=['"]#E5F7EF['"]/g, 'iconBg={ui.colors.successSoft}');
  code = code.replace(/iconBg=['"]#EAF7E8['"]/g, 'iconBg={ui.colors.successSoft}');
  code = code.replace(/iconBg=['"]#FFF3E2['"]/g, 'iconBg={ui.colors.warningSoft}');
  code = code.replace(/iconBg=['"]#F1EBFF['"]/g, 'iconBg={ui.colors.infoSoft}');
  code = code.replace(/iconBg=['"]rgba\(239, 68, 68, 0.1\)['"]/g, 'iconBg={ui.colors.destructiveSoft}');
  code = code.replace(/iconBg=['"]rgba\(245, 158, 11, 0.1\)['"]/g, 'iconBg={ui.colors.warningSoft}');
  code = code.replace(/iconBg=['"]rgba\(59, 130, 246, 0.1\)['"]/g, 'iconBg={ui.colors.infoSoft}');
  code = code.replace(/iconBg=['"]rgba\(15, 118, 110, 0.1\)['"]/g, 'iconBg={ui.colors.primarySoft}');

  fs.writeFileSync(file, code);
  console.log(`Updated ${file}`);
}
