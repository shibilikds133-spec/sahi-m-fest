const fs = require('fs');
let c = fs.readFileSync('supabase/migrations/173_leaderboard_preview_rpc.sql', 'utf8');
c = c.replace(/\\\\\\$/g, '$'); // wait, just remove all backslashes!
c = c.replace(/\\\\/g, ''); 
fs.writeFileSync('supabase/migrations/173_leaderboard_preview_rpc.sql', c);
