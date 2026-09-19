const fs = require('fs');
let file = fs.readFileSync('src/components/layout/AdminAppShell.tsx', 'utf8');
file = file.replace(/  Palette,\\n  Moon,\\n  Sun,\\n  Bell,/g, '  Palette,\n  Moon,\n  Sun,\n  Bell,');
fs.writeFileSync('src/components/layout/AdminAppShell.tsx', file);
