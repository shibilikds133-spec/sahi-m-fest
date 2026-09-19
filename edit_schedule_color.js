const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  `className="py-section-gap px-gutter bg-alviora-surface/20 border-y border-alviora-border fade-in-up visible"`,
  `className="py-section-gap px-gutter bg-transparent border-t border-white/5 fade-in-up visible"`
);

// We should also ensure the Carousel uses the navy blue theme cleanly
// The gradients are already #011635 which is correct for the light navy blue / dark blue theme.

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated Schedule section container color");
