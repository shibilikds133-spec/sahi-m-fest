const fs = require('fs');
let code = fs.readFileSync('src/components/ui/SsfSkeleton.tsx', 'utf8');
if (!code.includes('designSystem')) {
  code = `import { ui } from '../../constants/designSystem';\n` + code;
}
code = code.replace(/'#E2E8F0'/g, 'ui.colors.surfaceStrong');
fs.writeFileSync('src/components/ui/SsfSkeleton.tsx', code);
