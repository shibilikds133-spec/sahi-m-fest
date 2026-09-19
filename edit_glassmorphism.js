const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Main container
content = content.replace(
  `className="bg-[#1f383e] rounded-xl border border-white/5 overflow-hidden shadow-2xl"`,
  `className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]"`
);

// Header
content = content.replace(
  `className="grid grid-cols-12 gap-4 p-4 border-b border-white/5 bg-[#182d31] font-label-sm text-label-sm text-white/50 uppercase tracking-widest font-bold"`,
  `className="grid grid-cols-12 gap-4 p-4 border-b border-white/10 bg-black/20 font-label-sm text-label-sm text-white/60 uppercase tracking-widest font-bold"`
);

// Row
content = content.replace(
  `className="grid grid-cols-12 gap-4 p-4 md:px-6 md:py-8 border-b border-white/5 items-center bg-alviora-bg/50 hover:bg-white/5 transition-colors"`,
  `className="grid grid-cols-12 gap-4 p-4 md:px-6 md:py-8 border-b border-white/5 items-center bg-transparent hover:bg-white/10 transition-colors duration-300"`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Glassmorphism style applied to leaderboard");
