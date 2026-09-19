const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Remove LEADERBOARD badge
content = content.replace(
  /\{\/\* Rotated Badge \*\/\}\s*<div className="hidden lg:block absolute -left-\[5\.5rem\] top-24 -rotate-90 origin-bottom-right">\s*<span className="bg-\[#1C5FA8\] text-white text-\[12px\] font-bold uppercase tracking-\[0\.3em\] px-4 py-1\.5 rounded-sm">\s*LEADERBOARD\s*<\/span>\s*<\/div>/g,
  `{/* Rotated Badge removed */}`
);

// Fix Team Rankings text fill color issue
content = content.replace(
  /<h2 className="text-4xl md:text-5xl font-bold glass-text mb-4 leading-tight tracking-tight">\s*Team <span className="inline-block bg-\[#1C5FA8\] text-white px-4 py-1 rounded-2xl -translate-y-1">Rankings<\/span>\s*<\/h2>/g,
  `<h2 className="text-4xl md:text-5xl font-bold mb-4 leading-tight tracking-tight">\n                    <span className="glass-text">Team</span> <span className="inline-block bg-[#1C5FA8] text-white px-4 py-1 rounded-2xl -translate-y-1">Rankings</span>\n                  </h2>`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed badge overlap and text fill issue.");
