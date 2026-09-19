const fs = require('fs'); let c = fs.readFileSync('src/app/(admin)/settings/leaderboard/item-results.tsx', 'utf8');
c = c.replace(/\\{itemCategoryCodes\\.get\\(group\\.item_id\\)\\?\\.map\\(\\(code: string\\) => \\{[\\s\\S]*?\\}\\)}\\)/g, '');
fs.writeFileSync('src/app/(admin)/settings/leaderboard/item-results.tsx', c);

