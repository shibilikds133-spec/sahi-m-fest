const fs = require('fs');
let c = fs.readFileSync('supabase/migrations/173_leaderboard_preview_rpc.sql', 'utf8');
c = c.replace(/AS \\$\\$/g, 'AS \$\$');
c = c.replace(/\\$\\$/g, '\$\$');
c = c.replace(/\\$;/g, '\$\$;');
c = c.replace(/AS \\$/g, 'AS \$\$');
c = c.replace(/\\$/g, '\$\$');
// Just completely rewrite it.
