const fs = require('fs');
const path = require('path');

const targetDirs = [
  'src/app/(admin)',
  'src/app/team',
  'src/components/ui',
  'src/components/team',
  'src/components/layout'
];

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const list = fs.readdirSync(dir);
  for (let file of list) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getFiles(fullPath, files);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const colorMap = {
  // Hardcoded UI Colors Missed
  "'#F3F8FB'": 'ui.colors.background',
  "'#F6FAFC'": 'ui.colors.background',
  "'#F8FCFD'": 'ui.colors.background',
  "'#ECFDF5'": 'ui.colors.successSoft',
  "'#EEF2F7'": 'ui.colors.surfaceMuted',
  "'#FFFFFF'": 'ui.colors.surface',
  "'#FFF'": 'ui.colors.surface',
  "'#0F172A'": 'ui.colors.text',
  "'#333'": 'ui.colors.text',
  "'#666'": 'ui.colors.textMuted',
  "'#888'": 'ui.colors.textSubtle',
  "'#999'": 'ui.colors.textSubtle',
  "'#475569'": 'ui.colors.textMuted',
  "'#64748B'": 'ui.colors.textMuted',
  "'#94a3b8'": 'ui.colors.textSubtle',
  "'#94A3B8'": 'ui.colors.textSubtle',
  "'#D1D5DB'": 'ui.colors.border',
  "'#DDEAF1'": 'ui.colors.border',
  "'#DDE7F3'": 'ui.colors.border',
  "'#D8E0EA'": 'ui.colors.border',
  "'#EEF5F8'": 'ui.colors.border',
  "'#D7E5EC'": 'ui.colors.border',
  "'rgba(15, 23, 42, 0.48)'": "ui.colors.surfaceStrong",
  "'rgba(15,23,42,0.48)'": "ui.colors.surfaceStrong",
  "'rgba(15, 23, 42, 0.34)'": "ui.colors.surfaceMuted",
  "'#123B73'": "ui.colors.primary",
  "'#123B63'": "ui.colors.primary",
  "'#16B8D9'": "ui.colors.info",
  "'#0B1F3A'": "ui.colors.primaryHover",
  "'#EAF7FA'": "ui.colors.infoSoft",
  "'#0F2A45'": "ui.shadow.shadowColor",
  "'#000'": "ui.shadow.shadowColor",

  // team/dashboard.tsx iconBg colors
  "'#EAF1FF'": 'ui.colors.primarySoft',
  "'#E5F7EF'": 'ui.colors.successSoft',
  "'#EAF7E8'": 'ui.colors.successSoft',
  "'#FFF3E2'": 'ui.colors.warningSoft',
  "'#F1EBFF'": 'ui.colors.infoSoft',
  
  // Specific cases
  "'#B91C1C'": "ui.colors.destructive",
  "'#b91c1c'": "ui.colors.destructive",
  "'#c2410c'": "ui.colors.warning",
  "'#1E3A8A'": "ui.colors.info",
  "'#078B5A'": "ui.colors.success",
  "'#059669'": "ui.colors.success",
  "'#0B6BDB'": "ui.colors.info",
  "'#1D4ED8'": "ui.colors.info",
  "'#D97706'": "ui.colors.warning",
  "'#d97706'": "ui.colors.warning",
  "'#E8F5E9'": "ui.colors.successSoft",
  "'#DBEAFE'": "ui.colors.infoSoft",
  "'#FEE2E2'": "ui.colors.destructiveSoft",
  "'#fee2e2'": "ui.colors.destructiveSoft",
  "'#DCFCE7'": "ui.colors.successSoft",
  "'#F3F4F6'": "ui.colors.surfaceMuted",
};

// tailwind color map
const twMap = {
  'bg-[#123B63]': 'bg-ui-primary',
  'bg-[#1E3A8A]': 'bg-ui-info',
  'text-[#123B63]': 'text-ui-primary',
  'border-[#123B63]': 'border-ui-primary',
  'bg-[#E8F5E9]': 'bg-ui-success-soft',
  'text-[#334155]': 'text-ui-text-muted',
};

const colorsBlockReplacement = `const colors = {
  navy: ui.colors.primaryHover,
  blue: ui.colors.primary,
  cyan: ui.colors.info,
  teal: ui.colors.primary,
  green: ui.colors.success,
  bg: ui.colors.background,
  card: ui.colors.surface,
  border: ui.colors.border,
  text: ui.colors.text,
  muted: ui.colors.textMuted,
  soft: ui.colors.infoSoft,
};`;

let allFiles = [];
for (const dir of targetDirs) {
  allFiles = allFiles.concat(getFiles(dir));
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const file of allFiles) {
  if (file.includes('team-leader-portal.tsx') || file.includes('schedulePdfService.ts') || file.includes('participantItemsPdfService.ts')) {
    continue;
  }

  let code = fs.readFileSync(file, 'utf8');
  let originalCode = code;

  // 1. Replace the hardcoded `const colors = { ... }` block in leaderboard files
  const colorsBlockRegex = /const colors = \{\s*navy:[^}]+soft:[^\}]+,\s*\};/gs;
  code = code.replace(colorsBlockRegex, colorsBlockReplacement);

  // 2. Map standard colors
  for (const [hex, token] of Object.entries(colorMap)) {
    const hexVal = hex.substring(1, hex.length - 1); 
    const hexValEscaped = escapeRegExp(hexVal);
    
    // Replace JSX props: color="#FFF" -> color={ui.colors.surface}
    const regexProp = new RegExp(`(\\w+)=([\\'\\"])${hexValEscaped}\\2`, 'gi');
    code = code.replace(regexProp, `$1={${token}}`);

    // Replace style object values: '#FFF' -> ui.colors.surface
    const regexStyle = new RegExp(`([\\'\\"])${hexValEscaped}\\1`, 'gi');
    // We must avoid replacing strings inside Tailwind classNames! 
    // Wait, regexStyle might replace "border-[#1E3A8A]" inside a className string if it's not careful. But it checks for quotes! 
    // `([\'\"])${hexValEscaped}\1` matches precisely "'#FFF'" or '"#FFF"', not strings containing it. So it won't affect Tailwind classes.
    code = code.replace(regexStyle, token);
  }

  // 3. Tailwind classes
  for (const [twOld, twNew] of Object.entries(twMap)) {
    code = code.split(twOld).join(twNew);
  }

  if (code !== originalCode) {
    if (!code.includes('designSystem')) {
      code = `import { ui } from '@/constants/designSystem';\n` + code;
    }
    fs.writeFileSync(file, code);
    console.log(`Updated ${file}`);
  }
}
console.log('Done mapping batch 2 hardcoded colors.');
