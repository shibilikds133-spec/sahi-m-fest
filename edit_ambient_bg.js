const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 1. Add Ambient Background Glows inside the root div
content = content.replace(
  /<div style=\{\{ flex: 1, width: "100%", height: "100vh", overflowY: "auto", overflowX: "hidden" \}\} className="bg-\[#050505\] text-alviora-body font-body-md antialiased">/,
  `<div style={{ flex: 1, width: "100%", height: "100vh", overflowY: "auto", overflowX: "hidden" }} className="bg-[#050505] text-alviora-body font-body-md antialiased relative">
      {/* Fixed Ambient Background Glows */}
      <div className="fixed top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-gradient-to-br from-[#1C5FA8]/15 via-[#1C5FA8]/5 to-transparent rounded-full blur-[140px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-gradient-to-tl from-[#1C5FA8]/15 via-[#1C5FA8]/5 to-transparent rounded-full blur-[140px] pointer-events-none z-0"></div>`
);

// 2. Add glass-text class to CSS
content = content.replace(
  /\.animate-subtle-motion \{ animation: subtle-motion 3s ease-in-out infinite; display: inline-block; \}/,
  `.animate-subtle-motion { animation: subtle-motion 3s ease-in-out infinite; display: inline-block; }
              .glass-text { 
                background: linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.7) 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                text-shadow: 0 4px 20px rgba(255,255,255,0.15);
              }`
);

// Apply glass-text to main headings
content = content.replace(
  /<h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl text-white mb-6 leading-tight font-bold">/g,
  `<h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl glass-text mb-6 leading-tight font-bold">`
);

content = content.replace(
  /<h2 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight tracking-tight">/g,
  `<h2 className="text-4xl md:text-5xl font-bold glass-text mb-4 leading-tight tracking-tight">`
);

content = content.replace(
  /<h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-alviora-heading mb-2 font-bold">/g,
  `<h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg glass-text mb-2 font-bold">`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Added ambient glows and glass text effects.");
