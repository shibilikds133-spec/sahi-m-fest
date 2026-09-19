const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /className="absolute inset-0 bg-gradient-to-r from-alviora-bg\/95 via-alviora-bg\/80 to-transparent z-10"/,
  `className="absolute inset-0 bg-gradient-to-r from-[#050505]/95 via-[#050505]/80 to-transparent z-10"`
);

content = content.replace(
  /className="absolute inset-0 bg-alviora-bg\/40 z-10"/,
  `className="absolute inset-0 bg-black/40 z-10"`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Replaced blue overlays with black overlays in Hero section.");
