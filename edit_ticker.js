const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /<span className="material-symbols-outlined text-alviora-accent shrink-0 z-10" style=\{\{fontVariationSettings:"'FILL' 1", fontSize: "18px"\}\}>sensors<\/span>/,
  `<span className="hidden md:block material-symbols-outlined text-alviora-accent shrink-0 z-10" style={{fontVariationSettings:"'FILL' 1", fontSize: "18px"}}>sensors</span>`
);

// Also remove gap on mobile so the ticker takes full width
content = content.replace(
  /<div className="flex items-center gap-3 w-full max-w-container-max mx-auto">/,
  `<div className="flex items-center md:gap-3 w-full max-w-container-max mx-auto px-2 md:px-0">`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated Ticker.");
