const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /className="relative w-full rounded-\[2.5rem\] overflow-hidden min-h-fit md:min-h-\[85vh\] flex items-center shadow-2xl border border-white\/5 bg-black"/,
  `className="relative w-full rounded-[2.5rem] overflow-hidden min-h-fit md:min-h-[85vh] flex items-center shadow-2xl border-[1.5px] border-white/10 ring-1 ring-white/5 bg-black shadow-[inset_0_0_40px_rgba(255,255,255,0.05)]"`
);

content = content.replace(
  /\{\/\* Overlays completely removed as per user request \*\/\}/,
  `{/* Slight blur overlay and glassy inner border */}
            <div className="absolute inset-0 backdrop-blur-[3px] bg-black/20 z-10 pointer-events-none"></div>
            <div className="absolute inset-0 rounded-[2.5rem] border-[1px] border-white/10 z-10 pointer-events-none"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 z-10 pointer-events-none"></div>`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Added glassy borders and blur overlay to Hero section.");
