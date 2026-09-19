const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /\{\/\* Background Video using Load Manager \*\/\}\s*<VideoBackground \/>/,
  `{/* Background Video Removed as per request */}`
);

content = content.replace(
  /\{\/\* Dark Overlays for readability and matching theme \*\/\}\s*<div className="absolute inset-0 bg-gradient-to-r from-alviora-bg\/95 via-alviora-bg\/80 to-transparent z-10"><\/div>\s*<div className="absolute inset-0 bg-alviora-bg\/40 z-10"><\/div>/,
  `{/* Overlays Removed */}`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Removed Hero Background Video and Overlays.");
