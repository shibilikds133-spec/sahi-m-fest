const fs = require("fs");
const filePath = "src/components/publicLanding/SahithyolsavLandingPage.web.tsx";
let content = fs.readFileSync(filePath, "utf8");

content = content.replace(
  /\{\/\* Top Leaderboard \*\/\}/,
  `</>)}
        {/* Top Leaderboard */}`
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Syntax fixed");
