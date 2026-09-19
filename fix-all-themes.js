const fs = require('fs');
const path = require('path');

const targetDirs = [
  'src/app/(admin)',
  'src/app/team',
  'src/components/ui',
  'src/components/team'
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
  // Red/Danger variants
  "'#DC2626'": 'ui.colors.destructive',
  "'#EF4444'": 'ui.colors.destructive',
  "'#991B1B'": 'ui.colors.destructive',
  "'#7F1D1D'": 'ui.colors.destructive',
  "'#F87171'": 'ui.colors.destructive',
  "'rgba(220, 38, 38, 0.95)'": 'ui.colors.destructive',
  "'#FEF2F2'": 'ui.colors.destructiveSoft',
  "'#FECACA'": 'ui.colors.destructiveSoft',

  // Green/Success variants
  "'#16A34A'": 'ui.colors.success',
  "'#1B6B3A'": 'ui.colors.success',
  "'#047857'": 'ui.colors.success',
  "'#065F46'": 'ui.colors.success',
  "'#10B981'": 'ui.colors.success',
  "'#22C55E'": 'ui.colors.success',
  "'#15803d'": 'ui.colors.success',
  "'#F0FDF4'": 'ui.colors.successSoft',
  "'#BBF7D0'": 'ui.colors.successSoft',

  // Yellow/Warning variants
  "'#FEF3C7'": 'ui.colors.warningSoft',
  "'#FDE68A'": 'ui.colors.warningSoft',
  "'#92400E'": 'ui.colors.warning',
  "'#B45309'": 'ui.colors.warning',
  "'#F59E0B'": 'ui.colors.warning',
  "'#FBBF24'": 'ui.colors.warning',

  // Neutrals/Borders/Backgrounds
  "'#FFFFFF'": 'ui.colors.surface',
  "'#FFF'": 'ui.colors.surface',
  "'#000000'": 'ui.colors.text',
  "'#111827'": 'ui.colors.text',
  "'#0F172A'": 'ui.colors.text',
  "'#334155'": 'ui.colors.text',
  "'#4B5563'": 'ui.colors.textMuted',
  "'#6B7280'": 'ui.colors.textMuted',
  "'#9CA3AF'": 'ui.colors.textSubtle',
  "'#CBD5E1'": 'ui.colors.border',
  "'#E2E8F0'": 'ui.colors.border',
  "'#EDF2F7'": 'ui.colors.surfaceMuted',
  "'#F8FAFC'": 'ui.colors.background',
  "'#F1F5F9'": 'ui.colors.surfaceMuted',
  "'rgba(226, 232, 240, 0.8)'": 'ui.colors.border',
  "'rgba(226, 232, 240, 0.6)'": 'ui.colors.border',
  "'rgba(255,255,255,0.12)'": 'ui.colors.border',
  "'rgba(255, 255, 255, 0.12)'": 'ui.colors.border',
  "'rgba(255,255,255,0.06)'": 'ui.colors.surfaceStrong',
  "'rgba(255, 255, 255, 0.06)'": 'ui.colors.surfaceStrong',
  "'rgba(255, 255, 255, 0.20)'": 'ui.colors.border',
  "'rgba(255,255,255,0.5)'": 'ui.colors.textMuted',
  "'rgba(255, 255, 255, 0.5)'": 'ui.colors.textMuted',
  "'rgba(255,255,255,0.7)'": 'ui.colors.textMuted',

  // Primary variants
  "'#0F766E'": 'ui.colors.primary',
  "'#14B8A6'": 'ui.colors.primary',
  "'#2563EB'": 'ui.colors.primary',
  "'#3B82F6'": 'ui.colors.primary',
  "'#E6F6F2'": 'ui.colors.primarySoft',
  "'#D1FAE5'": 'ui.colors.primarySoft',
  "'#FFF7ED'": 'ui.colors.primarySoft'
};

let allFiles = [];
for (const dir of targetDirs) {
  allFiles = allFiles.concat(getFiles(dir));
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

for (const file of allFiles) {
  if (file.includes('team-leader-portal.tsx') || file.includes('leaderboard\\\\controls.tsx') || file.includes('leaderboard/controls.tsx')) {
    continue;
  }
  if (file.includes('schedulePdfService.ts') || file.includes('participantItemsPdfService.ts')) {
    continue;
  }

  let code = fs.readFileSync(file, 'utf8');
  let originalCode = code;

  for (const [hex, token] of Object.entries(colorMap)) {
    const hexVal = hex.substring(1, hex.length - 1); // remove outer single quotes
    const hexValEscaped = escapeRegExp(hexVal);
    
    // 1. Replace JSX props: color="#FFF" -> color={ui.colors.surface}
    // We match any word = quote hex quote
    const regexProp = new RegExp(`(\\w+)=([\\'\\"])${hexValEscaped}\\2`, 'gi');
    code = code.replace(regexProp, `$1={${token}}`);

    // 2. Replace style object values or strings: '#FFF' -> ui.colors.surface
    const regexStyle = new RegExp(`([\\'\\"])${hexValEscaped}\\1`, 'gi');
    code = code.replace(regexStyle, token);
  }

  if (code !== originalCode) {
    if (!code.includes('designSystem')) {
      code = `import { ui } from '@/constants/designSystem';\n` + code;
    }
    fs.writeFileSync(file, code);
    console.log(`Updated ${file}`);
  }
}
console.log('Done mapping hardcoded colors to ui.colors.');
