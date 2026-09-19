const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /className="bg-black\/20 backdrop-blur-sm text-alviora-accent font-label-sm text-label-sm uppercase tracking-widest docked full-width top-0 z-\[60\] h-10 flex items-center px-margin-desktop overflow-hidden whitespace-nowrap border-b border-alviora-border"/,
  `className="bg-white/5 backdrop-blur-md text-alviora-accent font-label-sm text-label-sm uppercase tracking-widest docked full-width top-0 z-[60] h-10 flex items-center px-margin-desktop overflow-hidden whitespace-nowrap border-b border-white/10"`
);

content = content.replace(
  /className="bg-alviora-bg\/80 backdrop-blur-xl border-b border-white\/5 docked full-width top-0 sticky z-50 transition-all duration-300 shadow-sm"/,
  `className="bg-white/5 backdrop-blur-3xl border-b border-white/10 docked full-width top-0 sticky z-50 transition-all duration-300 shadow-[0_4px_30px_rgba(0,0,0,0.1)]"`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Applied glassmorphism to Header.");
