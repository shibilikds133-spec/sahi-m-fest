const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");
content = content.replace(/onClick=\{\(\) => setIsMobileMenuOpen\(false\)\}/g, "onPress={() => setIsMobileMenuOpen(false)}");
fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed Link onClick to onPress");
