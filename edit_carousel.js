const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

// The current overlay is:
// <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-[#011635] via-[#011635]/80 to-transparent" />
// We change it to black to match the theme.
content = content.replace(
  /className="absolute inset-x-0 bottom-0 h-3\/4 bg-gradient-to-t from-\[#011635\] via-\[#011635\]\/80 to-transparent"/g,
  `className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black via-black/80 to-transparent"`
);

// We should also check the header of the card which is:
// <div className="bg-[#011635]/60 backdrop-blur-md rounded-2xl p-3 border border-white/10 flex flex-col items-center justify-center min-w-[70px] shadow-lg">
content = content.replace(
  /className="bg-\[#011635\]\/60 backdrop-blur-md rounded-2xl p-3 border border-white\/10 flex flex-col items-center justify-center min-w-\[70px\] shadow-lg"/g,
  `className="bg-black/60 backdrop-blur-md rounded-2xl p-3 border border-white/10 flex flex-col items-center justify-center min-w-[70px] shadow-lg"`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Updated overlay colors to black on Schedule cards");
