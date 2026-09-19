const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /\{\/\* Dark Overlays for readability and matching theme \*\/\}\s*<div className="absolute inset-0 bg-gradient-to-r from-\[#050505\]\/95 via-\[#050505\]\/80 to-transparent z-10"><\/div>\s*<div className="absolute inset-0 bg-black\/40 z-10"><\/div>/,
  `{/* Overlays completely removed as per user request */}`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Completely removed all overlays from Hero section.");
