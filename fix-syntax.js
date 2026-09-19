const fs = require('fs');

// Fix src/app/(admin)/index.tsx
let code = fs.readFileSync('src/app/(admin)/index.tsx', 'utf8');

// Strip out BOM if present
if (code.charCodeAt(0) === 0xFEFF) {
  code = code.slice(1);
}

// Just strip weird unicode chars entirely
code = code.replace(/[\uFFFD]/g, '');

const PAGE_BG_regex = /const PAGE_BG \= \'\#E2E8F0\'\;/g;
if (!code.match(PAGE_BG_regex)) {
    // maybe it has weird whitespace?
    code = code.replace(/const PAGE_BG[^\n]+/, "const PAGE_BG = '#E2E8F0';");
}

fs.writeFileSync('src/app/(admin)/index.tsx', code);

// Fix src/app/(admin)/participants/[id]/index.tsx
let partCode = fs.readFileSync('src/app/(admin)/participants/[id]/index.tsx', 'utf8');

// The error was: Unexpected keyword 'const'. (123:2)
//  124 |   const [addEventError, setAddEventError] = useState<string>('');
// Let's check what's before it!
let lines = partCode.split('\n');
console.log('Lines around 123 in participants/[id]/index.tsx:');
console.log(lines.slice(120, 126).join('\n'));

