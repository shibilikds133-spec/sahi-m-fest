const fs = require('fs');

const files = [
  'src/app/(admin)/index.tsx',
  'src/app/(admin)/judges/index.tsx',
  'src/app/(admin)/participants/[id]/index.tsx',
  'src/app/(admin)/schedule/[id]/results.tsx',
  'src/app/(admin)/schedule/index.tsx',
  'src/app/team/dashboard.tsx',
  'src/components/layout/AdminAppShell.tsx',
  'src/core/hooks/useJudges.ts'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    // Read raw buffer
    const buf = fs.readFileSync(file);
    let str = '';
    
    // Check for UTF-16 LE BOM (FF FE)
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
      str = buf.toString('utf16le');
    } else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
       // UTF-16 BE
       str = buf.toString('utf16le'); // node doesn't have utf16be, but just in case
    } else {
       // Might be UTF-16 without BOM, but let's see if every second byte is 0
       let isUTF16 = true;
       for (let i = 1; i < Math.min(100, buf.length); i += 2) {
         if (buf[i] !== 0 && buf[i] !== 0x20 && buf[i] !== 0x0A && buf[i] !== 0x0D) {
            // Not definitive but heuristic
         }
       }
       // Let's just try utf16le if it has 0 bytes
       if (buf.indexOf(0) !== -1) {
          str = buf.toString('utf16le');
       } else {
          str = buf.toString('utf8');
       }
    }
    
    // Write back as plain UTF-8
    fs.writeFileSync(file, str, 'utf8');
    console.log('Converted', file);
  }
}
