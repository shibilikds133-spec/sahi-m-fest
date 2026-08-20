const fs = require('fs');
let tw = fs.readFileSync('tailwind.config.js', 'utf8');
tw = tw.replace(/hsl\(var\(([^)]+)\)\)/g, 'var($1)');
fs.writeFileSync('tailwind.config.js', tw);
