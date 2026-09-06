const fs = require('fs');
let code = fs.readFileSync('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', 'utf8');
code = code.replace('export function SahithyolsavLandingPage() {', 'export function SahithyolsavLandingPage() {\n  console.log("Rendering Custom Landing Page!!");');
fs.writeFileSync('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', code);
