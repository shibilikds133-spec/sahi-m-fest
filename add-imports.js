const fs = require('fs');
const files = [
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

files.forEach(file => {
  if(!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  if (!code.includes('designSystem') && code.includes('ui.')) {
    fs.writeFileSync(file, 'import { ui } from "@/constants/designSystem";\n' + code);
    console.log('Added import to ' + file);
  }
});
