const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /bg-\[radial-gradient\(ellipse_at_center,_var\(--tw-gradient-stops\)\)\] from-\[#1C5FA8\]\/20 via-\[#050505\]\/50 to-\[#050505\]/g,
  `bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1C5FA8]/20 via-black/5 to-transparent`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed gradient blobs.");
