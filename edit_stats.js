const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Move down and increase width
content = content.replace(
  /<div className="relative z-20 max-w-5xl mx-auto px-4 -mt-10 mb-20 fade-in-up visible">/g,
  `<div className="relative z-20 max-w-[1200px] w-full mx-auto px-4 mt-8 mb-20 fade-in-up visible">`
);

// Add glass effect and wider spacing
content = content.replace(
  /<div className="bg-\[#121212\] border border-\[#222\] rounded-\[2rem\] p-6 md:p-8 flex flex-wrap items-center justify-between md:justify-around gap-6 shadow-2xl">/g,
  `<div className="bg-[#121212]/70 backdrop-blur-3xl border border-[#333] rounded-[2rem] p-6 md:p-10 flex flex-wrap items-center justify-between md:justify-around gap-6 shadow-2xl">`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Stats section updated.");
