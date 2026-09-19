const fs = require('fs');

let code = fs.readFileSync('src/app/team/dashboard.tsx', 'utf8');

// Inject design system if missing
if (!code.includes('designSystem')) {
  // Try finding an import to prepend to
  code = code.replace(/import \{.*?\} from 'react-native';/, match => `import { ui } from '../../constants/designSystem';\n` + match);
}

// Remove constants
code = code.replace(/const NAVY = .*\r?\n/g, '');
code = code.replace(/const MUTED = .*\r?\n/g, '');

// Replace usages
code = code.replace(/\bNAVY\b/g, 'ui.colors.text');
code = code.replace(/\bMUTED\b/g, 'ui.colors.textMuted');

// There's also TEAL and BORDER in this file based on grep output
code = code.replace(/const TEAL = .*\r?\n/g, '');
code = code.replace(/const BORDER = .*\r?\n/g, '');
code = code.replace(/\bTEAL\b/g, 'ui.colors.primary');
code = code.replace(/\bBORDER\b/g, 'ui.colors.border');
code = code.replace(/'#F8FAFB'/g, 'ui.colors.surfaceMuted');

fs.writeFileSync('src/app/team/dashboard.tsx', code);
console.log('Fixed team dashboard');
