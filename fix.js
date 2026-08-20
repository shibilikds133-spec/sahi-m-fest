
const fs = require('fs');
let c = fs.readFileSync('src/app/(admin)/settings/leaderboard/media-center.tsx', 'utf8');
c = c.replace(/alert\\\(\\\\'Success!/, 'alert(\'Success!');
fs.writeFileSync('src/app/(admin)/settings/leaderboard/media-center.tsx', c);

