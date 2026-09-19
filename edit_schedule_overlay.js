const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /<div className="absolute inset-0 bg-alviora-bg\/40 z-10 transition-colors duration-300 group-hover:bg-alviora-bg\/20"><\/div>/g,
  `{/* Overall overlay removed */}`
);

content = content.replace(
  /<div className="absolute inset-x-0 bottom-0 h-3\/4 bg-gradient-to-t from-\[#011635\] via-\[#011635\]\/80 to-transparent z-10"><\/div>/g,
  `<div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent z-10 pointer-events-none"></div>`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated Schedule Image Overlays.");
