const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// 1. Remove opaque background from POST-HERO BACKGROUND WRAPPER
content = content.replace(
  /<div className="relative w-full bg-\[#050505\] bg-cover bg-top bg-no-repeat">/g,
  `<div className="relative w-full bg-transparent">`
);
content = content.replace(
  /<div className="absolute inset-0 bg-\[#050505\] z-0 pointer-events-none"><\/div>/g,
  `{/* Background removed for uniformity */}`
);

// 2. Enhance the fixed ambient blobs for better glass effect
content = content.replace(
  /<div className="fixed top-\[-20%\] left-\[-10%\] w-\[50vw\] h-\[50vw\] bg-gradient-to-br from-\[#1C5FA8\]\/15 via-\[#1C5FA8\]\/5 to-transparent rounded-full blur-\[140px\] pointer-events-none z-0"><\/div>/g,
  `<div className="fixed top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1C5FA8]/20 via-[#050505]/50 to-[#050505] rounded-full blur-[100px] pointer-events-none z-0"></div>`
);
content = content.replace(
  /<div className="fixed bottom-\[-20%\] right-\[-10%\] w-\[50vw\] h-\[50vw\] bg-gradient-to-tl from-\[#1C5FA8\]\/15 via-\[#1C5FA8\]\/5 to-transparent rounded-full blur-\[140px\] pointer-events-none z-0"><\/div>/g,
  `<div className="fixed bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1C5FA8]/20 via-[#050505]/50 to-[#050505] rounded-full blur-[100px] pointer-events-none z-0"></div>`
);

// 3. Make sure the body has a proper solid base and the glass backdrop
content = content.replace(
  /className="bg-\[#050505\] text-alviora-body font-body-md antialiased relative"/g,
  `className="bg-[#050505] text-alviora-body font-body-md antialiased relative"`
);

// 4. Ensure leaderboard section doesn't have an opaque background that disrupts it.
// Leaderboard is currently: bg-[#121212] inside the bento container. We can add a backdrop filter there too.
content = content.replace(
  /className="bg-\[#121212\] rounded-\[2\.5rem\] border border-\[#222\] p-8 md:p-12 relative overflow-hidden shadow-2xl flex flex-col lg:flex-row gap-12"/g,
  `className="bg-[#121212]/70 backdrop-blur-3xl rounded-[2.5rem] border border-[#333] p-8 md:p-12 relative overflow-hidden shadow-2xl flex flex-col lg:flex-row gap-12"`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated backgrounds to be transparent/glassy.");
