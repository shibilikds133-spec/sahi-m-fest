const fs = require('fs');

// 1. Remove from AdminAppShell.tsx
let adminCode = fs.readFileSync('src/components/layout/AdminAppShell.tsx', 'utf8');
adminCode = adminCode.replace(/import \{ useTheme \} from '@\/core\/contexts\/ThemeContext';\nimport \{ Palette, Moon, Sun \} from 'lucide-react-native';/, '');
adminCode = adminCode.replace(/const ThemePicker = \(\) => \{[\s\S]*?^};\n/m, '');
adminCode = adminCode.replace(/<ThemePicker \/>/g, '');
adminCode = adminCode.replace(/<View style=\{\{ marginRight: 10 \}\}>\s*?<\/View>/g, '');
fs.writeFileSync('src/components/layout/AdminAppShell.tsx', adminCode);

// 2. Remove from TeamLeaderAppShell.tsx
try {
  let teamCode = fs.readFileSync('src/components/layout/TeamLeaderAppShell.tsx', 'utf8');
  teamCode = teamCode.replace(/import \{ useTheme \} from '@\/core\/contexts\/ThemeContext';\nimport \{ Palette, Moon, Sun \} from 'lucide-react-native';\n/, '');
  teamCode = teamCode.replace(/const ThemePicker = \(\) => \{[\s\S]*?^};\n/m, '');
  teamCode = teamCode.replace(/<ThemePicker \/>/g, '');
  teamCode = teamCode.replace(/<View style=\{\{ marginRight: 10 \}\}>\s*?<\/View>/g, '');
  fs.writeFileSync('src/components/layout/TeamLeaderAppShell.tsx', teamCode);
} catch (e) {}

// 3. Remove from _layout.tsx
let layoutCode = fs.readFileSync('src/app/_layout.tsx', 'utf8');
layoutCode = layoutCode.replace(/import \{ ThemeProvider as SsfThemeProvider \} from "@\/core\/contexts\/ThemeContext";\n/, '');
layoutCode = layoutCode.replace(/<SsfThemeProvider>\n/, '');
layoutCode = layoutCode.replace(/<\/SsfThemeProvider>\n/, '');
fs.writeFileSync('src/app/_layout.tsx', layoutCode);

console.log('Removed ThemePicker and SsfThemeProvider');
