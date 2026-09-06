const fs = require('fs');
let code = fs.readFileSync('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', 'utf8');
code = code.replace('<>', '<div style={{ flex: 1, width: "100%", minHeight: "100vh" }} className="bg-white">');
code = code.replace('</>', '</div>');
fs.writeFileSync('src/components/publicLanding/SahithyolsavLandingPage.web.tsx', code);
