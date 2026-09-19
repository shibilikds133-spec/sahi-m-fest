const fs = require('fs');
let code = fs.readFileSync('src/app/(admin)/judges/index.tsx', 'utf8');
if (!code.includes('designSystem')) {
  fs.writeFileSync('src/app/(admin)/judges/index.tsx', 'import { ui } from "@/constants/designSystem";\n' + code);
}
